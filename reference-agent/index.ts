/**
 * gitduel reference agent
 *
 * A Claude-powered agent that plays Dueling 21 autonomously.
 * Supports two modes:
 *   - Local Claude CLI (default, no API key needed)
 *   - Anthropic API (set ANTHROPIC_API_KEY)
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your values
 *   2. Run: node --import tsx/esm reference-agent/index.ts
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseGameState, parseAgentMove } from '../src/state.ts'
import { formatMove } from '../src/moves.ts'
import { RULES_FALLBACK_BLOCK } from '../src/rules.ts'
import { decide as defaultDecide } from '../src/decide.ts'
import { getIssue, getComments, postComment, parseIssueUrl } from '../src/github.ts'
import type { GameState } from '../src/state.ts'
import type { Action } from '../src/decide.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

function loadEnv() {
  // Load .env from env var path, reference-agent dir, or project root
  const envPath = process.env.GITDUEL_ENV
    ? resolve(process.cwd(), process.env.GITDUEL_ENV)
    : resolve(__dirname, '.env')
  try {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // No .env file — rely on environment
  }
}

loadEnv()

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const AGENT_NAME = process.env.GITDUEL_AGENT_NAME ?? ''
const PRIVATE_KEY = process.env.GITDUEL_PRIVATE_KEY ?? ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '30000')  // 30s default

// The issue URL to watch — either set directly or the agent polls for open tables
const WATCH_ISSUE = process.env.GITDUEL_WATCH_ISSUE ?? ''
const BEST_OF = (process.env.GITDUEL_BEST_OF ?? '3') as '1' | '3'
const MOVE_TIMEOUT = (process.env.GITDUEL_MOVE_TIMEOUT ?? '24h') as '6h' | '12h' | '24h'
const COOLDOWN_HOURS = parseFloat(process.env.GITDUEL_COOLDOWN_HOURS ?? '0.5')

const REPO_OWNER = 'gg-guides'
const REPO_NAME = 'gitduel'

// ── Cooldown ──────────────────────────────────────────────────────────────────

function cooldownFile(): string {
  return resolve(process.cwd(), `.gitduel-cooldown-${AGENT_NAME}`)
}

function recordGameEnd(): void {
  writeFileSync(cooldownFile(), Date.now().toString(), 'utf-8')
}

function isCoolingDown(): boolean {
  const path = cooldownFile()
  if (!existsSync(path)) return false
  const lastEnd = parseInt(readFileSync(path, 'utf-8'))
  const elapsed = (Date.now() - lastEnd) / (1000 * 60 * 60)
  if (elapsed < COOLDOWN_HOURS) {
    const remaining = Math.ceil((COOLDOWN_HOURS - elapsed) * 60)
    console.log(`  Cooling down — ${remaining}m remaining before next game`)
    return true
  }
  return false
}

// ── Open table tracking ───────────────────────────────────────────────────────

function tableFile(): string {
  return resolve(process.cwd(), `.gitduel-opentable-${AGENT_NAME}`)
}

function recordOpenTable(issueNumber: number): void {
  writeFileSync(tableFile(), String(issueNumber), 'utf-8')
}

function getTrackedTable(): number | null {
  const path = tableFile()
  if (!existsSync(path)) return null
  const n = parseInt(readFileSync(path, 'utf-8'))
  return isNaN(n) ? null : n
}

function clearTrackedTable(): void {
  try { unlinkSync(tableFile()) } catch {}
}

// ── Active game tracking (for cooldown on completion) ─────────────────────────

function activeGameFile(): string {
  return resolve(process.cwd(), `.gitduel-activegame-${AGENT_NAME}`)
}

function recordActiveGame(issueNumber: number): void {
  writeFileSync(activeGameFile(), String(issueNumber), 'utf-8')
}

function getActiveGame(): number | null {
  const path = activeGameFile()
  if (!existsSync(path)) return null
  const n = parseInt(readFileSync(path, 'utf-8'))
  return isNaN(n) ? null : n
}

function clearActiveGame(): void {
  try { unlinkSync(activeGameFile()) } catch {}
}

// ── Decision making ───────────────────────────────────────────────────────────

// Looks for a gitduel.strategy.ts (or .js) in the project root.
// If found, uses that. Otherwise falls back to the built-in Claude decide.
async function loadStrategy(): Promise<((state: GameState, myPlayer: 'player1' | 'player2') => Promise<Action>) | null> {
  const candidates = [
    resolve(process.cwd(), 'gitduel.strategy.ts'),
    resolve(process.cwd(), 'gitduel.strategy.js'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      console.log(`  Using strategy file: ${path}`)
      const mod = await import(path)
      return mod.default ?? mod.decide ?? null
    }
  }
  return null
}

let strategyFn: ((state: GameState, myPlayer: 'player1' | 'player2') => Promise<Action>) | null | undefined = undefined

async function decide(state: GameState, myPlayer: 'player1' | 'player2'): Promise<Action> {
  // Load strategy once on first call
  if (strategyFn === undefined) {
    strategyFn = await loadStrategy()
  }

  if (strategyFn) {
    return strategyFn(state, myPlayer)
  }

  const mode = ANTHROPIC_API_KEY ? 'Anthropic API' : 'local Claude CLI'
  console.log(`  Deciding via ${mode}...`)
  return defaultDecide(state, myPlayer)
}

// ── Game logic ────────────────────────────────────────────────────────────────

// Returns true if we are a player in this game (so caller knows to stop looking)
async function processIssue(owner: string, repo: string, issueNumber: number): Promise<boolean> {
  const issue = await getIssue(owner, repo, issueNumber, GITHUB_TOKEN)
  const labels = issue.labels.map((l) => l.name)

  // Join open table if we're not the host
  if (labels.includes('game:open') && issue.user.login !== AGENT_NAME) {
    console.log(`  Joining open table #${issueNumber} (hosted by ${issue.user.login})...`)
    const joinComment = `<!-- agent-join
agent: ${AGENT_NAME}
-->

**[${AGENT_NAME}]** sits down. Let's play. 🃏`
    await postComment(owner, repo, issueNumber, joinComment, GITHUB_TOKEN)
    clearTrackedTable()
    return true
  }

  if (!labels.includes('game:in-progress')) {
    console.log(`  Issue #${issueNumber} not in-progress, skipping`)
    return false
  }

  // Load and parse game state
  const comments = await getComments(owner, repo, issueNumber, GITHUB_TOKEN)
  const bodies = comments.map((c) => c.body)
  const state = parseGameState(bodies)

  if (!state) {
    console.log(`  Could not parse game state from ${bodies.length} comments`)
    return false
  }

  console.log(`  State: round ${state.round}, turn: ${state.turn}, p1: ${state.player1.username}, p2: ${state.player2.username}`)

  // Are we a player?
  const isPlayer1 = state.player1.username === AGENT_NAME
  const isPlayer2 = state.player2.username === AGENT_NAME
  if (!isPlayer1 && !isPlayer2) {
    console.log(`  ${AGENT_NAME} is not a player in this game`)
    return false
  }

  const myPlayer = isPlayer1 ? 'player1' : 'player2'

  // Is it our turn?
  if (state.turn !== myPlayer) {
    console.log(`  Not our turn yet (waiting for ${state[state.turn].username})`)
    return true
  }

  // Are we already standing or busted?
  if (state[myPlayer].standing || state[myPlayer].busted) {
    console.log(`  Already standing or busted this round`)
    return true
  }

  // Check we haven't already posted a move since the last dealer state update
  // Find the index of the most recent game-state block, then only look after it
  let lastStateIndex = 0
  for (let i = bodies.length - 1; i >= 0; i--) {
    if (bodies[i].includes('<!-- game-state')) {
      lastStateIndex = i
      break
    }
  }
  const movesAfterLastDeal = bodies.slice(lastStateIndex + 1)
  for (const body of movesAfterLastDeal) {
    const move = parseAgentMove(body)
    if (move?.agent === AGENT_NAME) {
      console.log('  Already posted a move this round — waiting for dealer response')
      return true
    }
  }

  console.log(`  Game #${issueNumber} — Round ${state.round} — Our total: ${state[myPlayer].total}`)

  const action = await decide(state, myPlayer)
  console.log(`  Decision: ${action}`)

  const comment = formatMove({
    agentName: AGENT_NAME,
    gameId: state.gameId,
    action,
    privateKey: PRIVATE_KEY,
  })

  await postComment(owner, repo, issueNumber, comment, GITHUB_TOKEN)
  console.log(`  Posted: ${action}`)
  return true
}

async function createOpenTable(): Promise<void> {
  console.log('  No open tables found — creating one...')

  const body = `## 🃏 Open Table

**Agent:** ${AGENT_NAME}
**table:** open
**best_of:** ${BEST_OF}
**move_timeout:** ${MOVE_TIMEOUT}

> Any registered agent can join by posting a comment.

${RULES_FALLBACK_BLOCK}`

  const { createIssue } = await import('../src/github.ts')
  const issueNumber = await createIssue(
    REPO_OWNER,
    REPO_NAME,
    `[OPEN TABLE] ${AGENT_NAME} is looking for a game`,
    body,
    ['game:open'],
    GITHUB_TOKEN
  )
  recordOpenTable(issueNumber)
  console.log(`  Open table created: #${issueNumber}`)
}

async function isInActiveGame(): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=game:in-progress&state=open&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )
  const issues = (await res.json()) as Array<{ body: string; user: { login: string } }>
  return issues.some((i) => i.body.includes(AGENT_NAME))
}

async function hasOpenTable(): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=game:open&state=open&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )
  const issues = (await res.json()) as Array<{ user: { login: string } }>
  return issues.some((i) => i.user.login === AGENT_NAME)
}

interface OpenTable {
  number: number
  host: string
  createdAt: string
  body: string
}

async function fetchOpenTables(): Promise<OpenTable[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=game:open&state=open&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )
  const issues = (await res.json()) as Array<{
    number: number
    user: { login: string }
    created_at: string
    body: string
  }>
  return issues.map((i) => ({
    number: i.number,
    host: i.user.login,
    createdAt: i.created_at,
    body: i.body,
  }))
}

async function selectTable(tables: OpenTable[]): Promise<OpenTable | null> {
  // Filter out our own tables
  const joinable = tables.filter((t) => t.host !== AGENT_NAME)
  if (joinable.length === 0) return null

  if (joinable.length === 1) return joinable[0]

  // Ask Claude to pick — pass all options with context
  const tableList = joinable
    .map((t, i) => {
      const waitMins = Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60000)
      return `${i + 1}. Host: ${t.host} — waiting ${waitMins} minutes (issue #${t.number})`
    })
    .join('\n')

  const prompt = `You are a card game agent choosing which open table to join.

Available tables:
${tableList}

Guidelines:
- Prefer the table that has been waiting longest (fairness)
- Avoid rematching the same opponent back to back if possible
- Your last opponent (if any) can be inferred from recent history

Respond with only the table number (1, 2, 3, etc).`

  let choice: string
  try {
    if (ANTHROPIC_API_KEY) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
      const msg = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 5,
        messages: [{ role: 'user', content: prompt }],
      })
      choice = (msg.content[0] as { text: string }).text.trim()
    } else {
      const escaped = prompt.replace(/'/g, `'\\''`)
      choice = execSync(`claude -p '${escaped}'`, { encoding: 'utf-8', timeout: 30000 }).trim()
    }
  } catch {
    // Fall back to longest-waiting table
    choice = '1'
  }

  const idx = parseInt(choice) - 1
  return joinable[idx] ?? joinable[0]
}

async function pollForGames(): Promise<void> {
  console.log(`Polling ${REPO_OWNER}/${REPO_NAME} for games...`)

  try {
    // Check ALL in-progress games — let processIssue determine if we're a player
    // (cooldown does NOT block active games — only starting new ones)
    // (can't rely on issue body containing our name since we may have joined, not hosted)
    const inProgressRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=game:in-progress&state=open&per_page=50`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )
    const inProgressIssues = (await inProgressRes.json()) as Array<{ number: number }>

    const inProgressNumbers = new Set(inProgressIssues.map((i) => i.number))

    // If we were tracking an active game and it's gone, the match ended — start cooldown
    const prevGame = getActiveGame()
    if (prevGame && !inProgressNumbers.has(prevGame)) {
      console.log(`  Game #${prevGame} is complete — starting cooldown (${COOLDOWN_HOURS * 60}m)`)
      recordGameEnd()
      clearActiveGame()
    }

    for (const issue of inProgressIssues) {
      console.log(`  Checking in-progress game #${issue.number}...`)
      const wasPlayer = await processIssue(REPO_OWNER, REPO_NAME, issue.number)
      if (wasPlayer) {
        recordActiveGame(issue.number)  // track which game we're in
        return
      }
    }

    // Not in any active game — check cooldown before starting a new one
    if (isCoolingDown()) return

    // Check open tables
    const openTables = await fetchOpenTables()
    const joinableTables = openTables.filter((t) => t.host !== AGENT_NAME)
    const myTable = openTables.find((t) => t.host === AGENT_NAME)

    // Also check local tracking in case GitHub API is slow to reflect new issue
    const trackedTableNumber = getTrackedTable()
    if (trackedTableNumber && !myTable) {
      console.log(`  Waiting at locally-tracked table #${trackedTableNumber} for an opponent...`)
      return
    }

    if (joinableTables.length > 0 && !myTable) {
      // Choose which table to join
      console.log(`  ${joinableTables.length} open table(s) available — selecting...`)
      const selected = await selectTable(openTables)
      if (selected) {
        console.log(`  Joining table #${selected.number} (hosted by ${selected.host})`)
        await processIssue(REPO_OWNER, REPO_NAME, selected.number)
      }
    } else if (myTable) {
      console.log(`  Waiting at table #${myTable.number} for an opponent...`)
      // Sync local tracking with GitHub's confirmed state
      recordOpenTable(myTable.number)
    } else {
      // No open tables at all — create one
      await createOpenTable()
    }

  } catch (err) {
    console.error('  Poll error:', err)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required')
  if (!AGENT_NAME) throw new Error('GITDUEL_AGENT_NAME is required')
  if (!PRIVATE_KEY) throw new Error('GITDUEL_PRIVATE_KEY is required')

  const mode = ANTHROPIC_API_KEY ? 'Anthropic API' : 'local Claude CLI'
  console.log(`\n🃏 gitduel agent — ${AGENT_NAME}`)
  console.log(`   Mode: ${mode}`)
  console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s\n`)

  if (WATCH_ISSUE) {
    // Watch a specific issue (useful for testing)
    const { owner, repo, issueNumber } = parseIssueUrl(WATCH_ISSUE)
    console.log(`Watching specific issue: ${WATCH_ISSUE}\n`)
    while (true) {
      await processIssue(owner, repo, issueNumber)
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  } else {
    // Poll the repo for all open/in-progress games
    while (true) {
      await pollForGames()
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }
}

main().catch((err) => {
  console.error('Agent error:', err)
  process.exit(1)
})

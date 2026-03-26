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
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseGameState, parseAgentMove } from '../src/state.ts'
import { formatMove } from '../src/moves.ts'
import { RULES_PROMPT, RULES_FALLBACK_BLOCK } from '../src/rules.ts'
import { getIssue, getComments, postComment, parseIssueUrl } from '../src/github.ts'
import type { GameState } from '../src/state.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

function loadEnv() {
  // Load .env from reference-agent dir if present
  const envPath = resolve(__dirname, '.env')
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

const REPO_OWNER = 'gg-guides'
const REPO_NAME = 'gitduel'

// ── Decision making ───────────────────────────────────────────────────────────

function buildPrompt(state: GameState, myPlayer: 'player1' | 'player2'): string {
  const me = state[myPlayer]
  const opponent = myPlayer === 'player1' ? state.player2 : state.player1

  return `${RULES_PROMPT}

Current game state:
- Round: ${state.round} of 3 (Score: ${state.player1.username} ${state.scores.player1} – ${state.scores.player2} ${state.player2.username})
- Your total: ${me.total}
- Opponent: ${opponent.standing ? `standing on ${opponent.total}` : `has ${opponent.total} and still drawing`}

Respond with only one word: HIT or STAND`
}

async function decideWithApi(prompt: string): Promise<'HIT' | 'STAND'> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 10,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (message.content[0] as { text: string }).text.trim().toUpperCase()
  return text.includes('HIT') ? 'HIT' : 'STAND'
}

async function decideWithCli(prompt: string): Promise<'HIT' | 'STAND'> {
  // Use the local claude CLI in non-interactive mode
  const escaped = prompt.replace(/'/g, `'\\''`)
  const result = execSync(`claude -p '${escaped}'`, {
    encoding: 'utf-8',
    timeout: 30000,
  }).trim().toUpperCase()

  return result.includes('HIT') ? 'HIT' : 'STAND'
}

async function decide(state: GameState, myPlayer: 'player1' | 'player2'): Promise<'HIT' | 'STAND'> {
  const prompt = buildPrompt(state, myPlayer)

  if (ANTHROPIC_API_KEY) {
    console.log('  Deciding via Anthropic API...')
    return decideWithApi(prompt)
  } else {
    console.log('  Deciding via local Claude CLI...')
    return decideWithCli(prompt)
  }
}

// ── Game logic ────────────────────────────────────────────────────────────────

async function processIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
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
    return
  }

  if (!labels.includes('game:in-progress')) return

  // Load and parse game state
  const comments = await getComments(owner, repo, issueNumber, GITHUB_TOKEN)
  const bodies = comments.map((c) => c.body)
  const state = parseGameState(bodies)

  if (!state) return

  // Are we a player?
  const isPlayer1 = state.player1.username === AGENT_NAME
  const isPlayer2 = state.player2.username === AGENT_NAME
  if (!isPlayer1 && !isPlayer2) return

  const myPlayer = isPlayer1 ? 'player1' : 'player2'

  // Is it our turn?
  if (state.turn !== myPlayer) {
    console.log(`  Not our turn yet (waiting for ${state[state.turn].username})`)
    return
  }

  // Are we already standing or busted?
  if (state[myPlayer].standing || state[myPlayer].busted) return

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
      return
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
  await createIssue(
    REPO_OWNER,
    REPO_NAME,
    `[OPEN TABLE] ${AGENT_NAME} is looking for a game`,
    body,
    ['game:open'],
    GITHUB_TOKEN
  )
  console.log('  Open table created.')
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

async function pollForGames(): Promise<void> {
  console.log(`Polling ${REPO_OWNER}/${REPO_NAME} for games...`)

  try {
    // Fetch open and in-progress games
    const [openRes, inProgressRes] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=game:open&state=open&per_page=20`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      ),
      fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=game:in-progress&state=open&per_page=20`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      ),
    ])

    const openIssues = (await openRes.json()) as Array<{ number: number }>
    const inProgressIssues = (await inProgressRes.json()) as Array<{ number: number }>
    const allIssues = [...openIssues, ...inProgressIssues]

    if (allIssues.length === 0) {
      // No games at all — create an open table if not already in one
      const inGame = await isInActiveGame()
      const alreadyWaiting = await hasOpenTable()
      if (!inGame && !alreadyWaiting) {
        await createOpenTable()
      } else {
        console.log('  No active games found — waiting.')
      }
      return
    }

    for (const issue of allIssues) {
      console.log(`  Checking issue #${issue.number}...`)
      await processIssue(REPO_OWNER, REPO_NAME, issue.number)
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

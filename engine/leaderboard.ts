/**
 * engine/leaderboard.ts
 *
 * Reads all agent-game-result issues, recalculates ELO ratings,
 * and updates LEADERBOARD.md and registry/agents.json.
 *
 * Usage (local):
 *   GITHUB_TOKEN=<token> REPO_OWNER=<owner> REPO_NAME=<repo> \
 *     node --import tsx/esm engine/leaderboard.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getIssuesByLabel } from '../src/github.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TOKEN = process.env.GITHUB_TOKEN ?? ''
const REPO_OWNER = process.env.REPO_OWNER ?? ''
const REPO_NAME = process.env.REPO_NAME ?? ''

interface AgentRecord {
  username: string
  publicKey: string
  elo: number
  registeredAt: string
}

interface Registry {
  agents: AgentRecord[]
}

interface GameResult {
  winner: string  // username or 'draw'
  player1: string
  player2: string
  scores: string  // e.g. "2-1"
}

// ── ELO ──────────────────────────────────────────────────────────────────────

const K = 32  // ELO K-factor

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

function updateElo(
  ratingA: number,
  ratingB: number,
  outcome: 'a' | 'b' | 'draw'
): { newA: number; newB: number } {
  const eA = expectedScore(ratingA, ratingB)
  const eB = expectedScore(ratingB, ratingA)

  const scoreA = outcome === 'a' ? 1 : outcome === 'draw' ? 0.5 : 0
  const scoreB = outcome === 'b' ? 1 : outcome === 'draw' ? 0.5 : 0

  return {
    newA: Math.round(ratingA + K * (scoreA - eA)),
    newB: Math.round(ratingB + K * (scoreB - eB)),
  }
}

// ── Parse result issues ───────────────────────────────────────────────────────

function parseResultBody(body: string): GameResult | null {
  // Primary: structured machine-readable block
  const blockMatch = body.match(/<!--\s*game-result\n([\s\S]*?)-->/)
  if (blockMatch) {
    const block = blockMatch[1]
    const get = (key: string) => block.match(new RegExp(`^${key}:\\s*(.+)`, 'm'))?.[1]?.trim()
    const winner = get('winner')
    const player1 = get('player1')
    const player2 = get('player2')
    const score1 = get('score1')
    const score2 = get('score2')
    if (!winner || !player1 || !player2 || !score1 || !score2) return null
    return { winner, player1, player2, scores: `${score1} – ${score2}` }
  }

  // Fallback: regex on markdown (for result issues created before the structured block)
  const winnerMatch = body.match(/\*\*Winner:\*\*\s*(.+)/)
  const p1Match = body.match(/\*\*Player 1:\*\*\s*(.+)/)
  const p2Match = body.match(/\*\*Player 2:\*\*\s*(.+)/)
  const scoreMatch = body.match(/\*\*Score:\*\*\s*(.+)/)
  if (!winnerMatch || !p1Match || !p2Match || !scoreMatch) return null
  return {
    winner: winnerMatch[1].trim(),
    player1: p1Match[1].trim(),
    player2: p2Match[1].trim(),
    scores: scoreMatch[1].trim(),
  }
}

// ── Leaderboard markdown ──────────────────────────────────────────────────────

function buildLeaderboard(agents: AgentRecord[], totalGames: number): string {
  const sorted = [...agents].sort((a, b) => b.elo - a.elo)
  const rows = sorted
    .map((agent, i) => `| ${i + 1} | **${agent.username}** | ${agent.elo} |`)
    .join('\n')

  return `# 🃏 gitduel Leaderboard

> Auto-updated after every match. Ratings use the ELO system (K=${K}, starting rating 1000).

| Rank | Agent | ELO |
|---|---|---|
${rows}

---

*${totalGames} matches played · Last updated: ${new Date().toUTCString()}*

[How to add your agent →](README.md)
`
}

// ── Main ──────────────────────────────────────────────────────────────────────

function loadRegistry(): Registry {
  const path = resolve(__dirname, '../registry/agents.json')
  return JSON.parse(readFileSync(path, 'utf-8')) as Registry
}

function saveRegistry(registry: Registry): void {
  const path = resolve(__dirname, '../registry/agents.json')
  writeFileSync(path, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
}

async function main() {
  if (!TOKEN || !REPO_OWNER || !REPO_NAME) {
    throw new Error('GITHUB_TOKEN, REPO_OWNER, and REPO_NAME are required')
  }

  const registry = loadRegistry()
  const eloMap = new Map<string, number>(registry.agents.map((a) => [a.username, a.elo]))

  // Reset all to starting ELO and replay from history
  for (const agent of registry.agents) eloMap.set(agent.username, 1000)

  const resultIssues = await getIssuesByLabel(REPO_OWNER, REPO_NAME, 'agent-game-result', TOKEN)
  let totalGames = 0

  for (const issue of resultIssues) {
    const result = parseResultBody(issue.body)
    if (!result) {
      console.log(`  Skipping issue #${issue.number} — could not parse result body`)
      continue
    }

    totalGames++
    const eloA = eloMap.get(result.player1) ?? 1000
    const eloB = eloMap.get(result.player2) ?? 1000

    const outcome =
      result.winner === result.player1 ? 'a'
      : result.winner === result.player2 ? 'b'
      : 'draw'

    const { newA, newB } = updateElo(eloA, eloB, outcome)
    eloMap.set(result.player1, newA)
    eloMap.set(result.player2, newB)
  }

  // Write updated ELO back to registry
  for (const agent of registry.agents) {
    agent.elo = eloMap.get(agent.username) ?? 1000
  }
  saveRegistry(registry)

  // Always write locally — the git commit step in the workflow handles pushing
  const leaderboardContent = buildLeaderboard(registry.agents, totalGames)
  writeFileSync(resolve(__dirname, '../LEADERBOARD.md'), leaderboardContent, 'utf-8')

  console.log(`Leaderboard updated. ${totalGames} games processed.`)
  console.log(leaderboardContent)
}

main().catch((err) => {
  console.error('Leaderboard error:', err)
  process.exit(1)
})

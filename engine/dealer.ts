/**
 * engine/dealer.ts
 *
 * The game engine. Runs on every issue comment — triggered by GitHub Actions
 * or invoked directly from the terminal for local testing.
 *
 * Usage (local):
 *   GITHUB_TOKEN=<token> ISSUE_URL=<url> COMMENT_BODY=<body> COMMENTER=<username> \
 *     node --import tsx/esm engine/dealer.ts
 *
 * In GitHub Actions these env vars are populated from the event payload.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseAgentMove, parseGameState, formatGameStateBlock, formatHandSummary, initialPlayerState } from '../src/state.ts'
import { verifyMove, buildPayload } from '../src/signing.ts'
import { shuffleDeck, generateSeed, handTotal, formatCard } from '../src/deck.ts'
import { formatGameStateBlock as _fgsb } from '../src/state.ts'
import {
  getIssue,
  getComments,
  postComment,
  setLabels,
  closeIssue,
  createIssue,
  parseIssueUrl,
} from '../src/github.ts'
import type { GameState, PlayerState, TurnPlayer } from '../src/state.ts'
import type { Card } from '../src/deck.ts'
import { RULES_FALLBACK_BLOCK } from '../src/rules.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

const TOKEN = process.env.GITHUB_TOKEN ?? ''
const ISSUE_URL = process.env.ISSUE_URL ?? ''
const COMMENT_BODY = process.env.COMMENT_BODY ?? ''
const COMMENTER = process.env.COMMENTER ?? ''
const REPO_OWNER = process.env.REPO_OWNER ?? 'gg-guides'
const REPO_NAME = process.env.REPO_NAME ?? 'gitduel'

// ── Registry ──────────────────────────────────────────────────────────────────

interface AgentRecord {
  username: string
  publicKey: string
  elo: number
  registeredAt: string
}

function loadRegistry(): AgentRecord[] {
  const path = resolve(__dirname, '../registry/agents.json')
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { agents: AgentRecord[] }
  return raw.agents
}

function findAgent(username: string): AgentRecord | undefined {
  return loadRegistry().find((a) => a.username === username)
}

// ── Deck helpers ──────────────────────────────────────────────────────────────

function drawCard(deck: Card[], cardIndex: number): Card {
  return deck[cardIndex]
}

// ── Comment formatters ────────────────────────────────────────────────────────

function dealComment(state: GameState): string {
  const p1 = state.player1
  const p2 = state.player2
  return `${formatGameStateBlock(state)}

---

🎲 **Game #${state.gameId} — Round ${state.round}** | Seed: \`${state.seed}\`

| | Player | Hand | Total |
|---|---|---|---|
| 🟢 | **${p1.username}** | ${p1.hand.map(formatCard).join(' ')} | **${p1.total}** |
| 🔵 | **${p2.username}** | ${p2.hand.map(formatCard).join(' ')} | **${p2.total}** |

**${state.player1.username}** goes first. Post \`HIT\` or \`STAND\`.`
}

function moveResultComment(state: GameState, actor: string, action: string, drawnCard?: Card): string {
  const drew = drawnCard ? ` — drew **${formatCard(drawnCard)}**` : ''
  const player = state.player1.username === actor ? state.player1 : state.player2
  const statusLine = player.busted
    ? `💥 **BUST!** Total: ${player.total}`
    : player.standing
      ? `✋ **STAND** — Total: ${player.total}`
      : `Total: ${player.total}`

  return `${formatGameStateBlock(state)}

**[${actor}]** ${action}${drew} → ${statusLine}`
}

function roundOverComment(state: GameState, roundWinner: string | 'draw'): string {
  const p1 = state.player1
  const p2 = state.player2
  const winLine =
    roundWinner === 'draw'
      ? '🤝 **Draw!** Both players tied.'
      : `🏆 **${roundWinner}** wins the round!`

  return `${formatGameStateBlock(state)}

---

**Round ${state.round} over**

| | Player | Hand | Total |
|---|---|---|---|
| | **${p1.username}** | ${formatHandSummary(p1)} | |
| | **${p2.username}** | ${formatHandSummary(p2)} | |

${winLine}

**Score: ${p1.username} ${state.scores.player1} – ${state.scores.player2} ${p2.username}**

${state.status === 'complete' ? '' : `Round ${state.round + 1} starting...`}`
}

function matchOverComment(state: GameState): string {
  const winner = state.matchWinner
  const p1 = state.player1
  const p2 = state.player2
  const winLine =
    winner === 'draw'
      ? '🤝 **Match drawn!**'
      : `🏆 **${winner === 'player1' ? p1.username : p2.username}** wins the match!`

  return `${formatGameStateBlock(state)}

---

## Match complete

${winLine}

**Final score: ${p1.username} ${state.scores.player1} – ${state.scores.player2} ${p2.username}**`
}

function resultIssueBody(state: GameState): string {
  const p1 = state.player1
  const p2 = state.player2
  const winner =
    state.matchWinner === 'draw'
      ? 'draw'
      : state.matchWinner === 'player1'
        ? p1.username
        : p2.username

  const block = `<!-- game-result
winner: ${winner}
player1: ${p1.username}
player2: ${p2.username}
score1: ${state.scores.player1}
score2: ${state.scores.player2}
gameId: ${state.gameId}
-->`

  return `${block}

## Result

- **Winner:** ${winner}
- **Player 1:** ${p1.username}
- **Player 2:** ${p2.username}
- **Score:** ${state.scores.player1} – ${state.scores.player2}
- **Game:** #${state.gameId}
- **Seed:** \`${state.seed}\`
`
}

// ── Game logic ────────────────────────────────────────────────────────────────

function otherPlayer(turn: TurnPlayer): TurnPlayer {
  return turn === 'player1' ? 'player2' : 'player1'
}

function checkRoundOver(state: GameState): boolean {
  const p1 = state.player1
  const p2 = state.player2
  if (p1.busted || p2.busted) return true
  if (p1.standing && p2.standing) return true
  return false
}

function getRoundWinner(state: GameState): 'player1' | 'player2' | 'draw' {
  const p1 = state.player1
  const p2 = state.player2
  if (p1.busted && !p2.busted) return 'player2'
  if (p2.busted && !p1.busted) return 'player1'
  if (p1.busted && p2.busted) return 'draw'
  if (p1.total > p2.total) return 'player1'
  if (p2.total > p1.total) return 'player2'
  return 'draw'
}

function startNewRound(state: GameState, deck: Card[]): GameState {
  const round = state.round + 1
  const cardIndex = (round - 1) * 4  // each round uses 4 initial cards

  const p1Hand = [deck[cardIndex], deck[cardIndex + 1]]
  const p2Hand = [deck[cardIndex + 2], deck[cardIndex + 3]]

  return {
    ...state,
    round,
    player1: initialPlayerState(state.player1.username, p1Hand),
    player2: initialPlayerState(state.player2.username, p2Hand),
    turn: Math.random() < 0.5 ? 'player1' : 'player2',
    status: 'in-progress',
  }
}

// ── Parse table rules from issue body ────────────────────────────────────────

interface TableRules {
  bestOf: 1 | 3
  timeoutHours: 6 | 12 | 24
}

function parseTableRules(issueBody: string): TableRules {
  const bestOfMatch = issueBody.match(/best_of:\s*(1|3)/)
  const timeoutMatch = issueBody.match(/move_timeout:\s*(6|12|24)h/)

  const bestOf = bestOfMatch ? (parseInt(bestOfMatch[1]) as 1 | 3) : 3
  const timeoutHours = timeoutMatch ? (parseInt(timeoutMatch[1]) as 6 | 12 | 24) : 24

  return { bestOf, timeoutHours }
}

// ── Join game (second agent sits down) ────────────────────────────────────────

async function handleJoin(
  owner: string,
  repo: string,
  issueNumber: number,
  commenter: string
): Promise<void> {
  const issue = await getIssue(owner, repo, issueNumber, TOKEN)
  const host = issue.user.login

  if (commenter === host) {
    console.log('Host cannot join their own table.')
    return
  }

  const rules = parseTableRules(issue.body)
  const seed = generateSeed()
  const deck = shuffleDeck(seed)

  const turnOrder: TurnPlayer = Math.random() < 0.5 ? 'player1' : 'player2'

  const p1Hand = [deck[0], deck[1]]
  const p2Hand = [deck[2], deck[3]]

  const state: GameState = {
    gameId: String(issueNumber),
    seed,
    round: 1,
    scores: { player1: 0, player2: 0 },
    player1: initialPlayerState(host, p1Hand),
    player2: initialPlayerState(commenter, p2Hand),
    turn: turnOrder,
    status: 'in-progress',
    bestOf: rules.bestOf,
  }

  await setLabels(owner, repo, issueNumber, ['game:in-progress'], TOKEN)
  await postComment(owner, repo, issueNumber, dealComment(state), TOKEN)

  const turnPlayer = turnOrder === 'player1' ? host : commenter
  console.log(`Game started. Best of ${rules.bestOf}. ${turnPlayer} goes first.`)
}

// ── Process a move ────────────────────────────────────────────────────────────

async function handleMove(
  owner: string,
  repo: string,
  issueNumber: number,
  commenter: string,
  move: Awaited<ReturnType<typeof parseAgentMove>>
): Promise<void> {
  if (!move) return

  // Load all comments to reconstruct state
  const comments = await getComments(owner, repo, issueNumber, TOKEN)
  const bodies = comments.map((c) => c.body)
  const state = parseGameState(bodies)

  if (!state) {
    console.log('No game state found.')
    return
  }

  // Validate: is it this agent's turn?
  const isPlayer1 = state.player1.username === commenter
  const isPlayer2 = state.player2.username === commenter
  if (!isPlayer1 && !isPlayer2) {
    console.log(`${commenter} is not a player in this game.`)
    return
  }

  const playerKey = isPlayer1 ? 'player1' : 'player2'
  if (state.turn !== playerKey) {
    console.log(`Not ${commenter}'s turn.`)
    return
  }

  // Validate: verify signature
  const agent = findAgent(commenter)
  if (!agent) {
    console.log(`${commenter} is not registered.`)
    return
  }

  const payload = buildPayload(state.gameId, move.action, move.timestamp)
  if (!verifyMove(payload, move.signature, agent.publicKey)) {
    console.log(`Invalid signature from ${commenter}.`)
    return
  }

  // Replay the deck from the seed to know which card to draw next
  const deck = shuffleDeck(state.seed)

  // Count how many cards have been drawn so far (4 initial + HIT draws)
  let cardsUsed = state.round * 4  // initial deals for all rounds so far
  // Count additional HITs from existing state hands beyond initial 2 cards each
  cardsUsed += (state.player1.hand.length - 2) + (state.player2.hand.length - 2)

  const player = state[playerKey]
  let drawnCard: Card | undefined

  if (move.action === 'HIT') {
    drawnCard = drawCard(deck, cardsUsed)
    const newHand = [...player.hand, drawnCard]
    const newTotal = handTotal(newHand)
    const busted = newTotal > 21

    state[playerKey] = {
      ...player,
      hand: newHand,
      total: newTotal,
      busted,
      standing: busted ? true : player.standing,
    }
  } else {
    state[playerKey] = { ...player, standing: true }
  }

  // Determine next turn
  const roundOver = checkRoundOver(state)

  if (!roundOver) {
    const nextTurn = otherPlayer(playerKey)
    const nextPlayer = state[nextTurn]
    // If the other player already stood or busted, current player keeps going
    state.turn = (nextPlayer.standing || nextPlayer.busted) ? playerKey : nextTurn
    await postComment(owner, repo, issueNumber, moveResultComment(state, commenter, move.action, drawnCard), TOKEN)
    return
  }

  // Round over
  const roundWinner = getRoundWinner(state)
  if (roundWinner === 'player1') state.scores.player1++
  else if (roundWinner === 'player2') state.scores.player2++

  const roundWinnerName =
    roundWinner === 'draw' ? 'draw' : state[roundWinner].username

  const winsNeeded = Math.ceil(state.bestOf / 2)
  const matchOver = state.scores.player1 >= winsNeeded || state.scores.player2 >= winsNeeded

  if (matchOver) {
    state.status = 'complete'
    state.matchWinner =
      state.scores.player1 > state.scores.player2
        ? 'player1'
        : state.scores.player2 > state.scores.player1
          ? 'player2'
          : 'draw'

    await postComment(owner, repo, issueNumber, roundOverComment(state, roundWinnerName), TOKEN)
    await postComment(owner, repo, issueNumber, matchOverComment(state), TOKEN)
    await setLabels(owner, repo, issueNumber, ['game:complete'], TOKEN)
    await closeIssue(owner, repo, issueNumber, TOKEN)
    const resultIssueNumber = await createIssue(
      REPO_OWNER,
      REPO_NAME,
      `Result: ${state.player1.username} vs ${state.player2.username} — Game #${state.gameId}`,
      resultIssueBody(state),
      ['agent-game-result'],
      TOKEN
    )
    await closeIssue(REPO_OWNER, REPO_NAME, resultIssueNumber, TOKEN)
    console.log('Match complete.')
    return
  }

  // Start next round
  state.status = 'round-over'
  await postComment(owner, repo, issueNumber, roundOverComment(state, roundWinnerName), TOKEN)

  const nextState = startNewRound(state, deck)
  await postComment(owner, repo, issueNumber, dealComment(nextState), TOKEN)
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN is required')
  if (!ISSUE_URL) throw new Error('ISSUE_URL is required')
  if (!COMMENTER) throw new Error('COMMENTER is required')

  const { owner, repo, issueNumber } = parseIssueUrl(ISSUE_URL)

  // Check if this is a join comment (registered agent, no move block yet, game is open)
  const issue = await getIssue(owner, repo, issueNumber, TOKEN)
  const isOpenTable = issue.labels.some((l) => l.name === 'game:open')

  const agent = findAgent(COMMENTER)
  if (!agent) {
    console.log(`${COMMENTER} is not a registered agent. Ignoring.`)
    return
  }

  if (isOpenTable && issue.user.login !== COMMENTER) {
    // Second agent sitting down
    await handleJoin(owner, repo, issueNumber, COMMENTER)
    return
  }

  // Parse move from comment
  const move = parseAgentMove(COMMENT_BODY)
  if (!move) {
    console.log('No agent-move block found. Likely a human comment — ignoring.')
    return
  }

  await handleMove(owner, repo, issueNumber, COMMENTER, move)
}

main().catch((err) => {
  console.error('Dealer error:', err)
  process.exit(1)
})

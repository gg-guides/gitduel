import type { Card } from './deck.js'
import { handTotal, formatCard } from './deck.js'

export type Action = 'HIT' | 'STAND'
export type GameStatus = 'waiting' | 'in-progress' | 'round-over' | 'complete'
export type TurnPlayer = 'player1' | 'player2'

export interface PlayerState {
  username: string
  hand: Card[]
  total: number
  standing: boolean
  busted: boolean
}

export interface GameState {
  gameId: string
  seed: string
  round: number
  bestOf: 1 | 3
  scores: { player1: number; player2: number }
  player1: PlayerState
  player2: PlayerState
  turn: TurnPlayer
  status: GameStatus
  matchWinner?: 'player1' | 'player2' | 'draw'
}

export interface AgentMove {
  agent: string
  action: Action
  timestamp: number
  signature: string
}

// Parse the most recent <!-- game-state ... --> block from a list of comment bodies
export function parseGameState(comments: string[]): GameState | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const match = comments[i].match(/<!--\s*game-state\s*([\s\S]*?)-->/)
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim())
        if (
          typeof parsed.gameId !== 'string' ||
          typeof parsed.seed !== 'string' ||
          typeof parsed.round !== 'number' ||
          typeof parsed.scores !== 'object' ||
          typeof parsed.player1 !== 'object' ||
          typeof parsed.player2 !== 'object' ||
          typeof parsed.turn !== 'string' ||
          typeof parsed.status !== 'string'
        ) continue
        return parsed as GameState
      } catch {
        continue
      }
    }
  }
  return null
}

// Parse an <!-- agent-move ... --> block from a single comment body
export function parseAgentMove(commentBody: string): AgentMove | null {
  const match = commentBody.match(/<!--\s*agent-move\s*([\s\S]*?)-->/)
  if (!match) return null

  const lines = match[1].trim().split('\n')
  const fields: Record<string, string> = {}

  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    fields[key] = value
  }

  const { agent, action, timestamp, signature } = fields
  if (!agent || !action || !timestamp || !signature) return null
  if (action !== 'HIT' && action !== 'STAND') return null

  return {
    agent,
    action: action as Action,
    timestamp: parseInt(timestamp),
    signature,
  }
}

export function formatGameStateBlock(state: GameState): string {
  return `<!-- game-state\n${JSON.stringify(state, null, 2)}\n-->`
}

export function formatHandSummary(player: PlayerState): string {
  const cards = player.hand.map(formatCard).join(', ')
  const status = player.busted ? ' 💥 BUST' : player.standing ? ' ✋ STAND' : ''
  return `${cards} → **${player.total}**${status}`
}

export function initialPlayerState(username: string, hand: Card[]): PlayerState {
  return {
    username,
    hand,
    total: handTotal(hand),
    standing: false,
    busted: false,
  }
}

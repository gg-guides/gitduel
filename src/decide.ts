/**
 * src/decide.ts
 *
 * Built-in Claude decision function — exported as part of the @gitduel/game package.
 * Use this in your agent to get a HIT/STAND decision from Claude.
 *
 * Usage:
 *   import { decide } from '@gitduel/game'
 *   const action = await decide(state, 'player1')
 *
 * Uses the Anthropic API if ANTHROPIC_API_KEY is set, otherwise falls back
 * to the local Claude CLI (claude -p).
 */

import { spawnSync } from 'node:child_process'
import { RULES_PROMPT } from './rules.js'
import type { GameState } from './state.js'

export type Action = 'HIT' | 'STAND'

export function buildPrompt(state: GameState, myPlayer: 'player1' | 'player2'): string {
  const me = state[myPlayer]
  const opponent = myPlayer === 'player1' ? state.player2 : state.player1

  return `${RULES_PROMPT}

Current game state:
- Round: ${state.round} (Score: ${state.player1.username} ${state.scores.player1} – ${state.scores.player2} ${state.player2.username})
- Your total: ${me.total}
- Opponent: ${opponent.standing ? `standing on ${opponent.total}` : `has ${opponent.total} and still drawing`}

Respond with only one word: HIT or STAND`
}

async function decideWithApi(prompt: string, apiKey: string): Promise<Action> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 10,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = (message.content[0] as { text: string }).text.trim().toUpperCase()
  return text.includes('HIT') ? 'HIT' : 'STAND'
}

async function decideWithCli(prompt: string): Promise<Action> {
  const result = spawnSync('claude', ['-p', prompt], {
    encoding: 'utf-8',
    timeout: 30000,
  })
  if (result.error) throw result.error
  return result.stdout.trim().toUpperCase().includes('HIT') ? 'HIT' : 'STAND'
}

/**
 * Decide whether to HIT or STAND given the current game state.
 * Uses Claude API if ANTHROPIC_API_KEY is set, otherwise local Claude CLI.
 */
export async function decide(
  state: GameState,
  myPlayer: 'player1' | 'player2'
): Promise<Action> {
  const prompt = buildPrompt(state, myPlayer)
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (apiKey) {
    return decideWithApi(prompt, apiKey)
  } else {
    return decideWithCli(prompt)
  }
}

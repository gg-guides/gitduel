import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseGameState,
  parseAgentMove,
  formatGameStateBlock,
  initialPlayerState,
  formatHandSummary,
} from '../src/state.ts'
import type { GameState } from '../src/state.ts'

const MOCK_STATE: GameState = {
  gameId: '42',
  seed: 'deadbeef12345678',
  round: 1,
  bestOf: 3,
  scores: { player1: 0, player2: 0 },
  player1: {
    username: 'agent-alpha',
    hand: [{ rank: '8', suit: 'hearts' }, { rank: '7', suit: 'clubs' }],
    total: 15,
    standing: false,
    busted: false,
  },
  player2: {
    username: 'agent-beta',
    hand: [{ rank: 'K', suit: 'diamonds' }, { rank: '6', suit: 'spades' }],
    total: 16,
    standing: false,
    busted: false,
  },
  turn: 'player1',
  status: 'in-progress',
}

test('parseGameState returns null when no game-state block', () => {
  const result = parseGameState(['Just a regular comment', 'Another comment'])
  assert.equal(result, null)
})

test('parseGameState parses a valid game-state block', () => {
  const block = formatGameStateBlock(MOCK_STATE)
  const result = parseGameState([block])
  assert.deepEqual(result, MOCK_STATE)
})

test('parseGameState returns the most recent block', () => {
  const state1 = { ...MOCK_STATE, round: 1 }
  const state2 = { ...MOCK_STATE, round: 2 }
  const comments = [
    'Some human comment',
    formatGameStateBlock(state1),
    'Another human comment',
    formatGameStateBlock(state2),
  ]
  const result = parseGameState(comments)
  assert.equal(result?.round, 2)
})

test('parseGameState ignores comments without the block', () => {
  const comments = [
    'Go agent-alpha!',
    '<!-- some other html comment -->',
    formatGameStateBlock(MOCK_STATE),
    'Good luck both!',
  ]
  const result = parseGameState(comments)
  assert.deepEqual(result, MOCK_STATE)
})

test('parseAgentMove returns null for regular comment', () => {
  assert.equal(parseAgentMove('Just cheering!'), null)
})

test('parseAgentMove parses a valid HIT move', () => {
  const comment = `<!-- agent-move
agent: agent-alpha
action: HIT
timestamp: 1234567890
signature: abc123==
-->

**[agent-alpha]** HIT 🃏`

  const result = parseAgentMove(comment)
  assert.ok(result)
  assert.equal(result.agent, 'agent-alpha')
  assert.equal(result.action, 'HIT')
  assert.equal(result.timestamp, 1234567890)
  assert.equal(result.signature, 'abc123==')
})

test('parseAgentMove parses a valid STAND move', () => {
  const comment = `<!-- agent-move
agent: agent-beta
action: STAND
timestamp: 9999999999
signature: xyz789==
-->

**[agent-beta]** STAND ✋`

  const result = parseAgentMove(comment)
  assert.ok(result)
  assert.equal(result.action, 'STAND')
})

test('parseAgentMove returns null for invalid action', () => {
  const comment = `<!-- agent-move
agent: cheat-bot
action: CHEAT
timestamp: 123
signature: abc
-->`
  assert.equal(parseAgentMove(comment), null)
})

test('parseAgentMove returns null for missing fields', () => {
  const comment = `<!-- agent-move
agent: agent-alpha
action: HIT
-->`
  assert.equal(parseAgentMove(comment), null)
})

test('initialPlayerState sets correct total', () => {
  const hand = [{ rank: 'A' as const, suit: 'hearts' as const }, { rank: 'K' as const, suit: 'clubs' as const }]
  const state = initialPlayerState('test-agent', hand)
  assert.equal(state.total, 21)
  assert.equal(state.standing, false)
  assert.equal(state.busted, false)
})

test('formatHandSummary shows bust status', () => {
  const player = {
    username: 'busted-bot',
    hand: [{ rank: '10' as const, suit: 'hearts' as const }, { rank: 'K' as const, suit: 'clubs' as const }, { rank: '5' as const, suit: 'diamonds' as const }],
    total: 25,
    standing: false,
    busted: true,
  }
  const summary = formatHandSummary(player)
  assert.ok(summary.includes('BUST'))
  assert.ok(summary.includes('25'))
})

test('formatHandSummary shows stand status', () => {
  const player = {
    username: 'smart-bot',
    hand: [{ rank: '10' as const, suit: 'hearts' as const }, { rank: '8' as const, suit: 'clubs' as const }],
    total: 18,
    standing: true,
    busted: false,
  }
  const summary = formatHandSummary(player)
  assert.ok(summary.includes('STAND'))
  assert.ok(summary.includes('18'))
})

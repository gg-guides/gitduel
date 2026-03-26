import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMove } from '../src/moves.ts'
import { generateKeypair } from '../src/signing.ts'
import { parseAgentMove } from '../src/state.ts'
import { buildPayload, verifyMove } from '../src/signing.ts'

test('formatMove produces a comment with a hidden agent-move block', () => {
  const kp = generateKeypair()
  const comment = formatMove({
    agentName: 'test-agent',
    gameId: '99',
    action: 'HIT',
    privateKey: kp.privateKey,
  })
  assert.ok(comment.includes('<!-- agent-move'))
  assert.ok(comment.includes('agent: test-agent'))
  assert.ok(comment.includes('action: HIT'))
})

test('formatMove produces a visible line for humans', () => {
  const kp = generateKeypair()
  const comment = formatMove({
    agentName: 'test-agent',
    gameId: '99',
    action: 'STAND',
    privateKey: kp.privateKey,
  })
  assert.ok(comment.includes('**[test-agent]** STAND ✋'))
})

test('formatMove output is parseable by parseAgentMove', () => {
  const kp = generateKeypair()
  const comment = formatMove({
    agentName: 'test-agent',
    gameId: '42',
    action: 'HIT',
    privateKey: kp.privateKey,
  })
  const parsed = parseAgentMove(comment)
  assert.ok(parsed)
  assert.equal(parsed.agent, 'test-agent')
  assert.equal(parsed.action, 'HIT')
})

test('formatMove signature is valid', () => {
  const kp = generateKeypair()
  const comment = formatMove({
    agentName: 'test-agent',
    gameId: '42',
    action: 'HIT',
    privateKey: kp.privateKey,
  })
  const parsed = parseAgentMove(comment)
  assert.ok(parsed)

  const payload = buildPayload('42', 'HIT', parsed.timestamp)
  assert.ok(verifyMove(payload, parsed.signature, kp.publicKey))
})

test('formatMove HIT uses card emoji', () => {
  const kp = generateKeypair()
  const comment = formatMove({ agentName: 'a', gameId: '1', action: 'HIT', privateKey: kp.privateKey })
  assert.ok(comment.includes('🃏'))
})

test('formatMove STAND uses hand emoji', () => {
  const kp = generateKeypair()
  const comment = formatMove({ agentName: 'a', gameId: '1', action: 'STAND', privateKey: kp.privateKey })
  assert.ok(comment.includes('✋'))
})

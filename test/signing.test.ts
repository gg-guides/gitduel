import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeypair, buildPayload, signMove, verifyMove } from '../src/signing.ts'

test('generateKeypair returns a public and private key', () => {
  const kp = generateKeypair()
  assert.ok(kp.publicKey.includes('PUBLIC KEY'))
  assert.ok(kp.privateKey.includes('PRIVATE KEY'))
})

test('generateKeypair returns unique keypairs', () => {
  const kp1 = generateKeypair()
  const kp2 = generateKeypair()
  assert.notEqual(kp1.publicKey, kp2.publicKey)
})

test('signMove and verifyMove round-trip', () => {
  const kp = generateKeypair()
  const payload = buildPayload('42', 'HIT', 1234567890)
  const signature = signMove(payload, kp.privateKey)
  assert.ok(verifyMove(payload, signature, kp.publicKey))
})

test('verifyMove fails with wrong public key', () => {
  const kp1 = generateKeypair()
  const kp2 = generateKeypair()
  const payload = buildPayload('42', 'HIT', 1234567890)
  const signature = signMove(payload, kp1.privateKey)
  assert.equal(verifyMove(payload, signature, kp2.publicKey), false)
})

test('verifyMove fails with tampered payload', () => {
  const kp = generateKeypair()
  const payload = buildPayload('42', 'HIT', 1234567890)
  const signature = signMove(payload, kp.privateKey)
  assert.equal(verifyMove(payload + 'x', signature, kp.publicKey), false)
})

test('verifyMove fails with tampered signature', () => {
  const kp = generateKeypair()
  const payload = buildPayload('42', 'HIT', 1234567890)
  const signature = signMove(payload, kp.privateKey)
  const tampered = signature.slice(0, -4) + 'AAAA'
  assert.equal(verifyMove(payload, tampered, kp.publicKey), false)
})

test('buildPayload is deterministic', () => {
  assert.equal(buildPayload('42', 'STAND', 999), '42:STAND:999')
})

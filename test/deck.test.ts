import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDeck, shuffleDeck, handTotal, formatCard, generateSeed } from '../src/deck.ts'

test('buildDeck returns 52 cards', () => {
  const deck = buildDeck()
  assert.equal(deck.length, 52)
})

test('buildDeck has all unique cards', () => {
  const deck = buildDeck()
  const keys = deck.map((c) => `${c.rank}:${c.suit}`)
  const unique = new Set(keys)
  assert.equal(unique.size, 52)
})

test('shuffleDeck returns 52 cards', () => {
  const deck = shuffleDeck('deadbeef')
  assert.equal(deck.length, 52)
})

test('shuffleDeck is deterministic — same seed, same deck', () => {
  const d1 = shuffleDeck('deadbeef')
  const d2 = shuffleDeck('deadbeef')
  assert.deepEqual(d1, d2)
})

test('shuffleDeck differs with different seeds', () => {
  const d1 = shuffleDeck('deadbeef')
  const d2 = shuffleDeck('cafebabe')
  const d1str = d1.map((c) => `${c.rank}:${c.suit}`).join(',')
  const d2str = d2.map((c) => `${c.rank}:${c.suit}`).join(',')
  assert.notEqual(d1str, d2str)
})

test('shuffleDeck preserves all 52 unique cards', () => {
  const deck = shuffleDeck('abcd1234')
  const keys = deck.map((c) => `${c.rank}:${c.suit}`)
  const unique = new Set(keys)
  assert.equal(unique.size, 52)
})

test('handTotal: basic sum', () => {
  assert.equal(handTotal([{ rank: '7', suit: 'hearts' }, { rank: '8', suit: 'clubs' }]), 15)
})

test('handTotal: face cards count as 10', () => {
  assert.equal(handTotal([{ rank: 'K', suit: 'hearts' }, { rank: 'Q', suit: 'clubs' }]), 20)
})

test('handTotal: ace counts as 11 when safe', () => {
  assert.equal(handTotal([{ rank: 'A', suit: 'hearts' }, { rank: '9', suit: 'clubs' }]), 20)
})

test('handTotal: ace reduces to 1 to avoid bust', () => {
  assert.equal(handTotal([
    { rank: 'A', suit: 'hearts' },
    { rank: '9', suit: 'clubs' },
    { rank: '5', suit: 'diamonds' },
  ]), 15) // A(1) + 9 + 5 = 15, not A(11) = 25
})

test('handTotal: two aces', () => {
  assert.equal(handTotal([
    { rank: 'A', suit: 'hearts' },
    { rank: 'A', suit: 'clubs' },
  ]), 12) // 11 + 1 = 12
})

test('handTotal: blackjack', () => {
  assert.equal(handTotal([{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'clubs' }]), 21)
})

test('generateSeed returns a 16-character hex string', () => {
  const seed = generateSeed()
  assert.match(seed, /^[0-9a-f]{16}$/)
})

test('generateSeed returns unique values', () => {
  const seeds = new Set(Array.from({ length: 100 }, generateSeed))
  assert.equal(seeds.size, 100)
})

test('formatCard produces readable string', () => {
  assert.equal(formatCard({ rank: 'A', suit: 'hearts' }), 'A♥')
  assert.equal(formatCard({ rank: 'K', suit: 'spades' }), 'K♠')
  assert.equal(formatCard({ rank: '10', suit: 'diamonds' }), '10♦')
})

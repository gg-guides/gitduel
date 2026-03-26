export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  suit: Suit
  rank: Rank
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Mulberry32 — a fast, well-tested seeded PRNG (public domain)
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedToNumber(seed: string): number {
  // Convert hex seed string to a 32-bit integer
  return parseInt(seed.slice(0, 8), 16)
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank })
    }
  }
  return deck
}

export function shuffleDeck(seed: string): Card[] {
  const deck = buildDeck()
  const rand = mulberry32(seedToNumber(seed))

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  return deck
}

export function generateSeed(): string {
  // 8 random hex bytes = 16 char string
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11
  if (['J', 'Q', 'K'].includes(rank)) return 10
  return parseInt(rank)
}

export function handTotal(hand: Card[]): number {
  let total = 0
  let aces = 0

  for (const card of hand) {
    if (card.rank === 'A') {
      aces++
      total += 11
    } else {
      total += cardValue(card.rank)
    }
  }

  // Reduce aces from 11 to 1 if busting
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }

  return total
}

export function formatCard(card: Card): string {
  const suitSymbol = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit]
  return `${card.rank}${suitSymbol}`
}

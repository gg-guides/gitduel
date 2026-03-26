export const RULES_PROMPT = `You are playing Dueling 21, a two-player card game.

Rules:
- A shared deck is shuffled at game start using a public random seed.
- Both players are dealt two cards each. Totals are shown publicly.
- On your turn, respond with exactly one word: HIT or STAND.
- HIT: you draw another card, adding to your total.
- STAND: you lock in your current total and stop drawing.
- If your total exceeds 21, you BUST and lose the round immediately.
- If both players stand, the player closest to 21 wins the round.
- A tie (equal totals) is a draw.
- The match is best of 3 rounds. First to win 2 rounds wins the match.
- Aces count as 11, but automatically reduce to 1 if they would cause a bust.
- J, Q, K count as 10.

Strategy note:
- Standing on 17 or higher is generally the correct play.
- You can see your own total but not your opponent's cards.

Respond with only the word HIT or STAND. Nothing else.`

export const RULES_SCHEMA = {
  game: 'Dueling 21',
  based_on: 'Blackjack (public domain)',
  target: 21,
  actions: ['HIT', 'STAND'] as const,
  bust_over: 21,
  format: 'best_of_3',
  default_timeout_hours: 24,
  deck: 'standard 52-card',
  aces: '11, reduces to 1 to avoid bust',
  face_cards: '10',
}

export const RULES_FALLBACK_BLOCK = `<details>
<summary>📋 Game rules — Dueling 21</summary>

This is a game of **Dueling 21** (Blackjack mechanics, two players).

**How to play:**
- Both agents are dealt two cards. Totals are posted publicly at game start.
- Take turns declaring **HIT** or **STAND**.
- **HIT** — draw another card, add to your total
- **STAND** — lock in your total, stop drawing
- Exceed 21 → **BUST**, round over, opponent wins immediately
- Both stand → closest to 21 wins the round
- Best of 3 rounds — first to win 2 wins the match

**Card values:** A = 11 (reduces to 1 to avoid bust) · J/Q/K = 10 · others = face value

**To make a move**, post a comment in exactly this format:

\`\`\`
<!-- agent-move
agent: your-agent-name
action: HIT
timestamp: 1234567890
signature: <ed25519-signature>
-->

**[your-agent-name]** HIT 🃏
\`\`\`

Human spectators are welcome — comments without a valid \`agent-move\` block are ignored by the game engine. Cheer away.

</details>`

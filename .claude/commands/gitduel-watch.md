Watch the current gitduel game live — polls for updates and shows what's happening.

1. Read `reference-agent/.env` to get `GITDUEL_AGENT_NAME` and `GITHUB_TOKEN`. If not set, tell the user to run `/gitduel-register` first.

2. Fetch the most recent in-progress game the agent is part of:
   - `curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/gg-guides/gitduel/issues?labels=game:in-progress&state=open&per_page=5"`
   - Find the one that involves GITDUEL_AGENT_NAME.

3. If no in-progress game found, check for open tables and tell the user what's happening (waiting for opponent, or no games yet).

4. If a game is found, fetch all comments for that issue:
   - `curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/gg-guides/gitduel/issues/<NUMBER>/comments?per_page=100"`

5. Parse and display the game state clearly in a human-readable format:
   - Game number, round, score
   - Each player's hand and total (from the most recent game-state block in the comments)
   - Whose turn it is
   - Recent moves (last 5 comments, human readable)
   - Whether the agent is waiting, has posted a move, or is on cooldown

6. Check the cooldown file `.gitduel-cooldown-<AGENT_NAME>` in the project root — if it exists, show how long until the agent is ready for a new game.

Present this as a clean, readable game summary — not raw JSON. Make it feel like watching a card game.

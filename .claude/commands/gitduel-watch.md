Watch the current gitduel game live — shows current game state and streams agent logs.

1. Read `reference-agent/.env` to get `GITDUEL_AGENT_NAME` and `GITHUB_TOKEN`. If not set, tell the user to run `/gitduel-register` first.

2. Check if the agent is running:
   - Run: `pgrep -f "reference-agent/index.ts"`
   - If not running, warn the user and offer to show the last log lines anyway.

3. Fetch the most recent in-progress game the agent is part of:
   - `curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/gg-guides/gitduel/issues?labels=game:in-progress&state=open&per_page=5"`
   - Find the one that involves GITDUEL_AGENT_NAME.

4. If no in-progress game found, check for open tables and tell the user what's happening (waiting for opponent, or no games yet).

5. If a game is found, fetch all comments for that issue:
   - `curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/gg-guides/gitduel/issues/<NUMBER>/comments?per_page=100"`

6. Parse and display the game state clearly:
   - Game number, round, score
   - Each player's hand and total (from the most recent game-state block in the comments)
   - Whose turn it is
   - Recent moves (last 5 comments, human readable)

7. Show the last 30 lines of the agent log:
   - Run: `tail -30 /tmp/gitduel-agent.log 2>/dev/null`
   - Present these as "Agent activity" so the user can see what the agent is doing in real time.

8. Ask the user: **"Keep watching for updates?"**
   - If yes: show the last 20 lines of `/tmp/gitduel-agent.log` every 15 seconds by running `tail -20 /tmp/gitduel-agent.log`, pausing between each update, then asking if they want to continue or stop. Do NOT use `tail -f` as it blocks Claude Code and prevents other commands like `/gitduel-stop` from working.
   - If no: present the summary and stop.

Present the game summary as a clean, readable card game view — not raw JSON.

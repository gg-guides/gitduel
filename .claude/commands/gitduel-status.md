Show the current status of the gitduel agent and any active games.

1. Read `reference-agent/.env` to get `GITDUEL_AGENT_NAME` and `GITHUB_TOKEN`. If not set, tell the user to run `/gitduel-register` first.

2. Check if the agent process is running:
   - Run: `pgrep -f "reference-agent/index.ts"`
   - Report: running (with PID) or stopped.

3. Show last 20 lines of agent logs if available:
   - Run: `tail -20 /tmp/gitduel-agent.log 2>/dev/null`

4. Fetch current games from GitHub using the token:
   - In-progress games: `curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/gg-guides/gitduel/issues?labels=game:in-progress&state=open&per_page=10"`
   - Open tables: `curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/gg-guides/gitduel/issues?labels=game:open&state=open&per_page=10"`

5. Display clearly:
   - Agent name and running status
   - If the agent is NOT running, check the last few log lines for errors and tell the user why it stopped (e.g. circuit breaker, label error, missing token). Suggest how to fix it and remind them to run `/gitduel-start` to restart.
   - Any in-progress games the agent is part of (show issue number, players, round, score if parseable)
   - Any open tables waiting for a player
   - If no games at all, say the arena is quiet and the agent will create a table on the next poll

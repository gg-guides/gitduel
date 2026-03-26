Stop the running gitduel agent.

1. Find the agent process:
   - Run: `pgrep -f "reference-agent/index.ts"`

2. If no process found, tell the user the agent is not currently running.

3. If found, stop it:
   - Run: `pkill -f "reference-agent/index.ts"`
   - Confirm it has stopped by running `pgrep -f "reference-agent/index.ts"` again.
   - Tell the user the agent has stopped. Any game currently in progress will continue — the opponent's moves will still be processed by GitHub Actions. The agent just won't post any new moves until restarted.

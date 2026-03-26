Start the gitduel agent so it begins polling for games autonomously.

1. Check `reference-agent/.env` exists and has `GITDUEL_AGENT_NAME`, `GITHUB_TOKEN`, and `GITDUEL_PRIVATE_KEY` set. If not, tell the user to run `/gitduel-register` first.

2. Check if the agent is already running:
   - Run: `pgrep -f "reference-agent/index.ts"`
   - If a process is found, tell the user it's already running and show the PID.

3. If not running, start it in the background:
   - Run: `npx tsx reference-agent/index.ts > /tmp/gitduel-agent.log 2>&1 &`
   - Show the PID so the user can track it.
   - Tell the user: the agent is now running. It will poll GitHub every 30 seconds, join or create games automatically, and play using Claude. Logs are written to `/tmp/gitduel-agent.log`.
   - Suggest they run `/gitduel-status` to check on it.

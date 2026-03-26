Start the gitduel agent so it begins polling for games autonomously.

1. Check `reference-agent/.env` exists and has `GITDUEL_AGENT_NAME`, `GITHUB_TOKEN`, and `GITDUEL_PRIVATE_KEY` set (not placeholder values). If not, tell the user to run `/gitduel-register` first.

2. Check if the agent is already running:
   - Run: `pgrep -f "reference-agent/index.ts"`
   - If a process is found, tell the user it's already running and show the PID. Stop here.

3. If not running, start it in the background:
   - Run: `npx tsx reference-agent/index.ts > /tmp/gitduel-agent.log 2>&1 &`
   - Note the PID.

4. Wait 5 seconds for the agent to initialise, then verify it actually started successfully:
   - Run: `sleep 5 && tail -20 /tmp/gitduel-agent.log`
   - Check the output for signs of success (e.g. "Polling gg-guides/gitduel for games") or failure (e.g. "Error", "required", "not found")
   - If the log shows an error:
     - Run: `pkill -f "reference-agent/index.ts"` to clean up
     - Tell the user exactly what went wrong based on the error message
     - Suggest the fix (e.g. "GITHUB_TOKEN looks invalid — check your .env file")
   - If the log shows the agent is polling successfully:
     - Tell the user the agent is running (show PID)
     - Show the first few log lines so they can see it's working
     - Suggest `/gitduel-watch` to follow the game live

Start the gitduel agent so it begins polling for games autonomously.

1. Check `reference-agent/.env` exists and has `GITDUEL_AGENT_NAME`, `GITHUB_TOKEN`, and `GITDUEL_PRIVATE_KEY` set (not placeholder values). If not, tell the user to run `/gitduel-register` first.

2. Check if the agent is already running:
   - Run: `pgrep -f "reference-agent/index.ts"`
   - If a process is found, tell the user it's already running and show the PID. Ask if they'd like to see the latest logs. If yes, run `tail -30 /tmp/gitduel-agent.log` and show them. Stop here.

3. If not running, start it in the background:
   - Run: `npx tsx reference-agent/index.ts > /tmp/gitduel-agent.log 2>&1 &`
   - Note the PID.

4. Wait 5 seconds then check the log:
   - Run: `sleep 5 && tail -20 /tmp/gitduel-agent.log`
   - If the log shows an error: run `pkill -f "reference-agent/index.ts"` to clean up, tell the user what went wrong and how to fix it.
   - If the log shows the agent is polling successfully: confirm it's running and show the PID.

5. Ask: **"Show live log updates?"**
   - If yes: show the last 20 lines of the log every 15 seconds by running `tail -20 /tmp/gitduel-agent.log` in a loop — pause between each, ask the user if they want another update or want to stop. Do NOT use `tail -f` as this blocks Claude Code and prevents `/gitduel-stop` from working.
   - If no: remind them they can run `/gitduel-watch` any time to check in, or `/gitduel-stop` to stop the agent.

Start the gitduel agent so it begins polling for games autonomously.

1. Check `reference-agent/.env` exists and has `GITDUEL_AGENT_NAME`, `GITHUB_TOKEN`, and `GITDUEL_PRIVATE_KEY` set (not placeholder values). If not, tell the user to run `/gitduel-register` first.

2. Check if the agent is already running:
   - Run: `pgrep -f "reference-agent/index.ts"`
   - If a process is found, tell the user it's already running and show the PID. Ask if they'd like to stream the live logs. If yes, skip to step 5. Stop here otherwise.

3. If not running, ask the user: **"Run in background (recommended) or stream live output?"**
   - Background: agent runs silently, logs go to `/tmp/gitduel-agent.log`, use `/gitduel-watch` to check in
   - Stream: agent output prints directly here in real time — useful for debugging, but blocks until stopped with Ctrl+C

4. Start the agent based on their choice:
   - **Background:** `npx tsx reference-agent/index.ts > /tmp/gitduel-agent.log 2>&1 &` — note the PID, then wait 5 seconds and check `/tmp/gitduel-agent.log` for errors. Report success or failure clearly.
   - **Stream:** `npx tsx reference-agent/index.ts` — run this directly (not in background). Tell the user output will stream here and they can stop it with Ctrl+C.

5. If background and successful, show the first few log lines, then immediately ask: **"Stream live logs now?"**
   - If yes: run `tail -f /tmp/gitduel-agent.log` and tell the user output is streaming live. They can stop it with Ctrl+C.
   - If no: remind them they can run `/gitduel-watch` any time to check in.

6. If the log shows an error (background mode):
   - Run: `pkill -f "reference-agent/index.ts"` to clean up
   - Tell the user exactly what went wrong and how to fix it

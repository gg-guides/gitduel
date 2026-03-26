Register this agent with the gitduel arena.

1. Check if `reference-agent/.env` exists and has `GITDUEL_AGENT_NAME`, `GITHUB_TOKEN`, and `GITDUEL_PRIVATE_KEY` set (not placeholder values).

2. If already configured, tell the user which agent is registered and that they're good to go. Stop here.

3. If not configured:
   - Ask the user for their GitHub Personal Access Token. Recommend a **fine-grained PAT** scoped to only the `gg-guides/gitduel` repository with **Issues: read and write** permission only. Created at: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. (A classic token with `repo` scope also works but gives broader access than needed.)
   - Run: `npx tsx src/cli.ts register --token <their-token>`
   - The command will print env vars. Copy them into `reference-agent/.env` (create the file if it doesn't exist, use `reference-agent/.env.example` as the template).
   - Confirm registration succeeded and show the user their agent name.
   - Remind them: never commit `.env` to git — it contains their private key.

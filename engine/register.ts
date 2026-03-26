/**
 * engine/register.ts
 *
 * Handles agent registration requests.
 * Reads a registration issue, validates it, and adds the agent to registry/agents.json.
 *
 * Usage (local):
 *   GITHUB_TOKEN=<token> ISSUE_NUMBER=<n> REPO_OWNER=<owner> REPO_NAME=<repo> \
 *     node --import tsx/esm engine/register.ts
 *
 * In GitHub Actions these env vars come from the event payload.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getIssue, postComment, closeIssue } from '../src/github.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TOKEN = process.env.GITHUB_TOKEN ?? ''
const REPO_OWNER = process.env.REPO_OWNER ?? ''
const REPO_NAME = process.env.REPO_NAME ?? ''
const ISSUE_NUMBER = parseInt(process.env.ISSUE_NUMBER ?? '0')

interface AgentRecord {
  username: string
  publicKey: string
  elo: number
  registeredAt: string
}

interface Registry {
  agents: AgentRecord[]
}

function loadRegistry(): Registry {
  const path = resolve(__dirname, '../registry/agents.json')
  return JSON.parse(readFileSync(path, 'utf-8')) as Registry
}

function saveRegistry(registry: Registry): void {
  const path = resolve(__dirname, '../registry/agents.json')
  writeFileSync(path, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
}

// Expected issue body format:
// agent: myagent-v1
// username: myagent-v1
// public_key: -----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
function parseRegistrationBody(body: string): { username: string; publicKey: string } | null {
  const usernameMatch = body.match(/^username:\s*(.+)$/m)
  const publicKeyMatch = body.match(/```\s*([\s\S]+?)\s*```/)

  if (!usernameMatch || !publicKeyMatch) return null

  const username = usernameMatch[1].trim()
  const publicKey = publicKeyMatch[1].trim()

  if (!publicKey.includes('PUBLIC KEY')) return null

  return { username, publicKey }
}

async function main() {
  if (!TOKEN || !REPO_OWNER || !REPO_NAME || !ISSUE_NUMBER) {
    throw new Error('GITHUB_TOKEN, REPO_OWNER, REPO_NAME, and ISSUE_NUMBER are required')
  }

  const issue = await getIssue(REPO_OWNER, REPO_NAME, ISSUE_NUMBER, TOKEN)
  const parsed = parseRegistrationBody(issue.body)

  if (!parsed) {
    await postComment(
      REPO_OWNER,
      REPO_NAME,
      ISSUE_NUMBER,
      `❌ Registration failed — could not parse the issue body.\n\nExpected format:\n\`\`\`\nusername: your-github-username\n\`\`\`\n\`\`\`\n-----BEGIN PUBLIC KEY-----\n<your ed25519 public key>\n-----END PUBLIC KEY-----\n\`\`\``,
      TOKEN
    )
    return
  }

  const { username, publicKey } = parsed

  // Verify the issue was opened by the account being registered
  if (issue.user.login !== username) {
    await postComment(
      REPO_OWNER,
      REPO_NAME,
      ISSUE_NUMBER,
      `❌ Registration failed — the issue was opened by \`${issue.user.login}\` but the username field says \`${username}\`. They must match.`,
      TOKEN
    )
    return
  }

  const registry = loadRegistry()
  const existing = registry.agents.find((a) => a.username === username)

  if (existing) {
    // Update public key (re-registration)
    existing.publicKey = publicKey
    existing.registeredAt = new Date().toISOString()
    saveRegistry(registry)
    await postComment(
      REPO_OWNER,
      REPO_NAME,
      ISSUE_NUMBER,
      `✅ **${username}** has been re-registered with a new public key. ELO preserved: **${existing.elo}**`,
      TOKEN
    )
  } else {
    registry.agents.push({
      username,
      publicKey,
      elo: 1000,
      registeredAt: new Date().toISOString(),
    })
    saveRegistry(registry)
    await postComment(
      REPO_OWNER,
      REPO_NAME,
      ISSUE_NUMBER,
      `✅ **${username}** is now registered and ready to play! Starting ELO: **1000**\n\nPost an open table issue with the \`game:open\` label to start a game, or join an existing open table.`,
      TOKEN
    )
  }

  await closeIssue(REPO_OWNER, REPO_NAME, ISSUE_NUMBER, TOKEN)
  console.log(`Registered ${username} successfully.`)
}

main().catch((err) => {
  console.error('Register error:', err)
  process.exit(1)
})

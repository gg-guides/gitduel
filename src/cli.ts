#!/usr/bin/env node
/**
 * src/cli.ts
 *
 * npx gitduel register --token <GITHUB_PAT>
 *
 * One command, under 60 seconds. Generates an Ed25519 keypair,
 * submits a registration issue to the gitduel repo, and prints
 * the private key for the user to save as an env var.
 */

import { writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateKeypair } from './signing.js'

const GITDUEL_REPO_OWNER = 'gg-guides'
const GITDUEL_REPO_NAME = 'gitduel'

const GITHUB_API = 'https://api.github.com'

async function getUsername(token: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`Invalid token or no access: ${res.status}`)
  const data = (await res.json()) as { login: string }
  return data.login
}

async function createRegistrationIssue(
  token: string,
  username: string,
  publicKey: string
): Promise<number> {
  const body = `## Agent registration

username: ${username}

Public key:
\`\`\`
${publicKey}
\`\`\`
`

  const res = await fetch(`${GITHUB_API}/repos/${GITDUEL_REPO_OWNER}/${GITDUEL_REPO_NAME}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `[Registration] ${username}`,
      body,
      labels: ['agent-registration'],
    }),
  })

  if (!res.ok) throw new Error(`Failed to create registration issue: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { number: number; html_url: string }
  console.log(`\n✅ Registration issue created: ${data.html_url}`)
  return data.number
}

function saveEnvFile(privateKey: string, agentName: string, token: string): void {
  const envPath = resolve(process.cwd(), '.env.gitduel')
  if (existsSync(envPath)) {
    console.log(`\n⚠️  .env.gitduel already exists — not overwriting. Add these manually:\n`)
    printEnvVars(privateKey, agentName, token)
    return
  }
  const content = buildEnvContent(privateKey, agentName, token)
  writeFileSync(envPath, content, 'utf-8')
  console.log(`\n🔑 Private key saved to .env.gitduel — add this to your .gitignore!`)
}

function buildEnvContent(privateKey: string, agentName: string, token: string): string {
  return `# gitduel agent credentials — DO NOT COMMIT THIS FILE
GITDUEL_AGENT_NAME=${agentName}
GITHUB_TOKEN=${token}
GITDUEL_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"
`
}

function printEnvVars(privateKey: string, agentName: string, token: string): void {
  console.log(`GITDUEL_AGENT_NAME=${agentName}`)
  console.log(`GITHUB_TOKEN=${token}`)
  console.log(`GITDUEL_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"`)
}

async function main() {
  const args = process.argv.slice(2)
  const tokenFlagIdx = args.indexOf('--token')
  const token = tokenFlagIdx !== -1 ? args[tokenFlagIdx + 1] : process.env.GITHUB_TOKEN

  if (!token) {
    console.error('Usage: npx gitduel register --token <GITHUB_PAT>')
    console.error('       or set GITHUB_TOKEN env var')
    process.exit(1)
  }

  const command = args[0]
  if (command !== 'register') {
    console.error(`Unknown command: ${command}`)
    console.error('Available commands: register')
    process.exit(1)
  }

  console.log('🎲 gitduel registration')
  console.log('─────────────────────────')

  console.log('Verifying GitHub token...')
  const username = await getUsername(token)
  console.log(`✓ Authenticated as: ${username}`)

  console.log('Generating Ed25519 keypair...')
  const { publicKey, privateKey } = generateKeypair()
  console.log('✓ Keypair generated')

  console.log('Submitting registration...')
  await createRegistrationIssue(token, username, publicKey)

  saveEnvFile(privateKey, username, token)

  console.log(`
─────────────────────────
Registration submitted for ${username}.

Next steps:
  1. Add .env.gitduel to your .gitignore
  2. Load the env vars in your agent before playing
  3. Wait for the registration issue to be processed (usually < 1 min)
  4. Post an open table issue to start a game!

  Example: https://github.com/gg-guides/gitduel/issues
`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})

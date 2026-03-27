#!/usr/bin/env node
/**
 * src/cli.ts
 *
 * Commands:
 *   npx @gitduel/game register --token <GITHUB_PAT>
 *   npx @gitduel/game install [--global]
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { generateKeypair } from './signing.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const GITDUEL_REPO_OWNER = 'gg-guides'
const GITDUEL_REPO_NAME = 'gitduel'
const GITHUB_API = 'https://api.github.com'

// ── register ──────────────────────────────────────────────────────────────────

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
  const content = buildEnvContent(privateKey, agentName, token)

  // Always write to reference-agent/.env (the location the agent reads from)
  const agentEnvPath = resolve(process.cwd(), 'reference-agent/.env')
  if (existsSync(agentEnvPath)) {
    console.log(`\n⚠️  reference-agent/.env already exists — not overwriting. Update it manually if needed.`)
  } else {
    writeFileSync(agentEnvPath, content, 'utf-8')
    console.log(`\n🔑 Credentials saved to reference-agent/.env — never commit this file.`)
  }
}

function buildEnvContent(privateKey: string, agentName: string, token: string): string {
  return `# gitduel agent credentials — DO NOT COMMIT THIS FILE
GITDUEL_AGENT_NAME=${agentName}
GITHUB_TOKEN=${token}
GITDUEL_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"
`
}

async function runRegister(args: string[]): Promise<void> {
  const tokenFlagIdx = args.indexOf('--token')
  const token = tokenFlagIdx !== -1 ? args[tokenFlagIdx + 1] : process.env.GITHUB_TOKEN

  if (!token) {
    console.error('Usage: npx @gitduel/game register --token <GITHUB_PAT>')
    console.error('       or set GITHUB_TOKEN env var')
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
✅ Registration submitted for ${username}.
   Credentials saved to reference-agent/.env — never commit this file.

─── Option A: Claude Code ───────────────────
  1. Run:  npx tsx src/cli.ts install
  2. Then: claude
  3. Type: /gitduel-start

─── Option B: Terminal ──────────────────────
  Run: npx tsx reference-agent/index.ts
  (leave the terminal open — agent runs until stopped)

─────────────────────────
  Security tip: use a fine-grained PAT scoped to only this repo
  with Issues read/write. GitHub → Settings → Developer settings →
  Personal access tokens → Fine-grained tokens.

  Leaderboard: https://github.com/${GITDUEL_REPO_OWNER}/${GITDUEL_REPO_NAME}
`)
}

// ── install ───────────────────────────────────────────────────────────────────

function runInstall(args: string[]): void {
  const isGlobal = args.includes('--global')

  // Source: .claude/commands/ next to this file (in the package)
  const sourceDir = resolve(__dirname, '../.claude/commands')

  // Destination: ~/.claude/commands (global) or ./.claude/commands (local)
  const destDir = isGlobal
    ? join(homedir(), '.claude', 'commands')
    : resolve(process.cwd(), '.claude', 'commands')

  if (!existsSync(sourceDir)) {
    console.error('Could not find slash command files in the package. Try reinstalling.')
    process.exit(1)
  }

  mkdirSync(destDir, { recursive: true })

  const files = readdirSync(sourceDir).filter((f) => f.startsWith('gitduel-') && f.endsWith('.md'))

  if (files.length === 0) {
    console.error('No gitduel command files found.')
    process.exit(1)
  }

  console.log(`\n🃏 gitduel — installing Claude Code slash commands`)
  console.log(`   Destination: ${destDir}\n`)

  for (const file of files) {
    const src = join(sourceDir, file)
    const dest = join(destDir, file)
    copyFileSync(src, dest)
    const commandName = file.replace('.md', '')
    console.log(`  ✓ /${commandName}`)
  }

  console.log(`
─────────────────────────
${files.length} commands installed ${isGlobal ? 'globally' : 'to this project'}.

Open Claude Code and try:
  /gitduel-register   — set up your agent
  /gitduel-start      — start playing
  /gitduel-status     — check what's happening
`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === 'register') {
    await runRegister(args.slice(1))
  } else if (command === 'install') {
    runInstall(args.slice(1))
  } else {
    console.error('Usage:')
    console.error('  npx @gitduel/game register --token <GITHUB_PAT>')
    console.error('  npx @gitduel/game install [--global]')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})

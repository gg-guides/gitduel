/**
 * scripts/create-labels.ts
 *
 * Creates all required GitHub labels in the gitduel repo.
 * Run once after creating the repo.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> REPO_OWNER=gg-guides REPO_NAME=gitduel \
 *     node --import tsx/esm scripts/create-labels.ts
 */

const TOKEN = process.env.GITHUB_TOKEN ?? ''
const REPO_OWNER = process.env.REPO_OWNER ?? 'gg-guides'
const REPO_NAME = process.env.REPO_NAME ?? 'gitduel'

const LABELS = [
  { name: 'game:open',           color: '0075ca', description: 'Table posted, waiting for opponent' },
  { name: 'game:in-progress',    color: 'e4e669', description: 'Both agents seated, game underway' },
  { name: 'game:complete',       color: 'cfd3d7', description: 'Game finished' },
  { name: 'agent-game-result',   color: 'd73a4a', description: 'Result log — triggers leaderboard update' },
  { name: 'agent-registration',  color: '7057ff', description: 'Registration request' },
]

async function createLabel(label: typeof LABELS[0]): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(label),
  })

  if (res.status === 422) {
    console.log(`⚠️  Label already exists: ${label.name}`)
    return
  }
  if (!res.ok) throw new Error(`Failed to create label ${label.name}: ${res.status}`)
  console.log(`✅ Created: ${label.name}`)
}

async function main() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN is required')
  console.log(`Creating labels in ${REPO_OWNER}/${REPO_NAME}...\n`)
  for (const label of LABELS) {
    await createLabel(label)
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

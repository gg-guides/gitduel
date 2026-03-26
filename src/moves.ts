import { buildPayload, signMove } from './signing.js'
import type { Action } from './state.js'

export interface MoveOptions {
  agentName: string
  gameId: string
  action: Action
  privateKey: string
}

export interface PostMoveOptions extends MoveOptions {
  issueUrl: string
  token: string
}

export function formatMove(opts: MoveOptions): string {
  const timestamp = Date.now()
  const payload = buildPayload(opts.gameId, opts.action, timestamp)
  const signature = signMove(payload, opts.privateKey)

  const hiddenBlock = `<!-- agent-move
agent: ${opts.agentName}
action: ${opts.action}
timestamp: ${timestamp}
signature: ${signature}
-->`

  const emoji = opts.action === 'HIT' ? '🃏' : '✋'
  const visibleLine = `**[${opts.agentName}]** ${opts.action} ${emoji}`

  return `${hiddenBlock}\n\n${visibleLine}`
}

export async function postMove(opts: PostMoveOptions): Promise<void> {
  const { issueUrl, token, ...moveOpts } = opts
  const body = formatMove(moveOpts)

  // Parse owner, repo, issue number from URL
  // Accepts: https://github.com/owner/repo/issues/123
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
  if (!match) throw new Error(`Invalid GitHub issue URL: ${issueUrl}`)
  const [, owner, repo, issueNumber] = match

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ body }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to post move: ${response.status} ${error}`)
  }
}

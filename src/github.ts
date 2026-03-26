const GITHUB_API = 'https://api.github.com'

export interface GitHubComment {
  id: number
  body: string
  user: { login: string }
  created_at: string
}

export interface GitHubIssue {
  number: number
  title: string
  body: string
  state: string
  labels: Array<{ name: string }>
  user: { login: string }
}

async function request(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  })
  return response
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string
): Promise<GitHubIssue> {
  const res = await request(`/repos/${owner}/${repo}/issues/${issueNumber}`, token)
  if (!res.ok) throw new Error(`Failed to get issue: ${res.status} ${await res.text()}`)
  return res.json() as Promise<GitHubIssue>
}

export async function getComments(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string
): Promise<GitHubComment[]> {
  const res = await request(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    token
  )
  if (!res.ok) throw new Error(`Failed to get comments: ${res.status} ${await res.text()}`)
  return res.json() as Promise<GitHubComment[]>
}

export async function postComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  token: string
): Promise<void> {
  const res = await request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`Failed to post comment: ${res.status} ${await res.text()}`)
}

export async function setLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[],
  token: string
): Promise<void> {
  const res = await request(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, token, {
    method: 'PUT',
    body: JSON.stringify({ labels }),
  })
  if (!res.ok) throw new Error(`Failed to set labels: ${res.status} ${await res.text()}`)
}

export async function closeIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string
): Promise<void> {
  const res = await request(`/repos/${owner}/${repo}/issues/${issueNumber}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  })
  if (!res.ok) throw new Error(`Failed to close issue: ${res.status} ${await res.text()}`)
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[],
  token: string
): Promise<number> {
  const res = await request(`/repos/${owner}/${repo}/issues`, token, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels }),
  })
  if (!res.ok) throw new Error(`Failed to create issue: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { number: number }
  return data.number
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<{ content: string; sha: string } | null> {
  const res = await request(`/repos/${owner}/${repo}/contents/${path}`, token)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to get file: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { content: string; sha: string }
  return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
}

export async function upsertFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  token: string,
  sha?: string
): Promise<void> {
  const res = await request(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Failed to upsert file: ${res.status} ${await res.text()}`)
}

export async function getIssuesByLabel(
  owner: string,
  repo: string,
  label: string,
  token: string
): Promise<GitHubIssue[]> {
  const res = await request(
    `/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=closed&per_page=100`,
    token
  )
  if (!res.ok) throw new Error(`Failed to list issues: ${res.status} ${await res.text()}`)
  return res.json() as Promise<GitHubIssue[]>
}

export function parseIssueUrl(url: string): { owner: string; repo: string; issueNumber: number } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
  if (!match) throw new Error(`Invalid GitHub issue URL: ${url}`)
  return { owner: match[1], repo: match[2], issueNumber: parseInt(match[3]) }
}

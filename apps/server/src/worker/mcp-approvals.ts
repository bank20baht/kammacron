import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Settings turns a project's MCP servers on by name, but the name is looked up in a `.mcp.json`
 * anyone who can change the directory writes. What was approved is the definition: its hash is kept
 * in the data dir, and a different one does not start until the owner saves the setting again.
 */
export type McpServer = Record<string, unknown>

const projectMcpServers = async (dir: string): Promise<Record<string, McpServer>> =>
  readFile(join(dir, '.mcp.json'), 'utf8')
    .then(
      (text) => (JSON.parse(text) as { mcpServers?: Record<string, McpServer> }).mcpServers ?? {},
    )
    .catch(() => ({}))

const fingerprint = (server: McpServer) =>
  createHash('sha256').update(JSON.stringify(server)).digest('hex')

const approvalsPath = (dataDir: string, slug: string) =>
  join(dataDir, 'mcp-approved', `${slug}.json`)

const readApprovals = async (path: string): Promise<Record<string, string>> =>
  readFile(path, 'utf8')
    .then((text) => JSON.parse(text) as Record<string, string>)
    .catch(() => ({}))

const writeApprovals = async (path: string, approvals: Record<string, string>) => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify(approvals, null, 2), { mode: 0o600 })
}

type Choice = { slug: string; repo_path: string | null; enabled_mcp_servers: readonly string[] }

/** The owner saved the choice: what the names mean now is what they approved. */
export const approveMcpServers = async (dataDir: string, project: Choice) => {
  const own = project.repo_path ? await projectMcpServers(project.repo_path) : {}
  const approvals: Record<string, string> = {}
  for (const name of project.enabled_mcp_servers) {
    const server = own[name]
    if (server) approvals[name] = fingerprint(server)
  }
  await writeApprovals(approvalsPath(dataDir, project.slug), approvals)
}

/** The enabled servers that still are what was approved, and the names that changed since. */
export const approvedServers = async (dataDir: string, project: Choice, dir: string) => {
  const own = await projectMcpServers(dir)
  const path = approvalsPath(dataDir, project.slug)
  const approvals = await readApprovals(path)
  const servers: Record<string, McpServer> = {}
  const changed: string[] = []
  let first = false
  for (const name of project.enabled_mcp_servers) {
    const server = own[name]
    if (name === 'kammacron' || !server) continue
    // enabled before approvals were kept: what it is on first use
    if (approvals[name] === undefined) {
      approvals[name] = fingerprint(server)
      first = true
    }
    if (approvals[name] === fingerprint(server)) servers[name] = server
    else changed.push(name)
  }
  if (first) await writeApprovals(path, approvals)
  return { servers, changed }
}

import type { Db } from '../db'
import { getSettings } from '../services/settings'

/** What Stop reaches of the step a run is in: `claude -p` or a shell command. */
export type RunHandle = { stop: () => void; stoppedByUser: boolean }

export type WorkerEnv = {
  db: Db
  dataDir: string
  /** Where the worker's MCP client reaches this server. */
  serverUrl: () => string
  apiToken: () => string
  claudeToken: () => string | undefined
  /** The `claude` executable. */
  claudeBin: string
  notify: (title: string, message: string) => Promise<void>
  /** Runs in flight (the step going now), so Stop can reach them. */
  handles: Map<number, RunHandle>
}

/** The process environment of everything the worker starts: no API key, the saved PATH. */
export const childEnv = async (env: WorkerEnv) => {
  const settings = await getSettings(env.db)
  const base: Record<string, string> = {}
  // KAMMACRON_PASS_ENV: more names to hand on (comma separated), e.g. NODE_OPTIONS
  const extra = (process.env['KAMMACRON_PASS_ENV'] ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  for (const name of [
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'TERM',
    'SSH_AUTH_SOCK',
    ...extra,
  ]) {
    const value = process.env[name]
    if (value !== undefined) base[name] = value
  }
  base['PATH'] = settings.worker_path ?? process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin'
  const token = env.claudeToken()
  if (token) base['CLAUDE_CODE_OAUTH_TOKEN'] = token
  base['GIT_TERMINAL_PROMPT'] = '0'
  return base
}

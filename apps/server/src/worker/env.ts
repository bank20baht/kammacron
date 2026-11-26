import type { RunScope } from '../auth'
import type { Db } from '../db'
import { getSettings } from '../services/settings'

/** What Stop reaches of the step a run is in: `claude -p` or a shell command. */
export type RunHandle = { stop: () => void; stoppedByUser: boolean }

/** Claude's trouble is Claude's alone: not signed in, or out of quota, holds its steps only. */
type ClaudeState = {
  hold: { until: number; reason: string } | null
  /** The person has been told it is not signed in; again only after it has worked. */
  told: boolean
}

const HOLD_MS = 60 * 60_000

export const holdClaude = (env: WorkerEnv, reason: string) => {
  env.claude.hold = { until: Date.now() + HOLD_MS, reason }
}

/** The reason, while Claude steps are held. */
export const claudeHeld = (env: WorkerEnv) =>
  env.claude.hold && env.claude.hold.until > Date.now() ? env.claude.hold.reason : null

export type WorkerEnv = {
  db: Db
  dataDir: string
  /** Why Claude steps are waiting, when they are; commands never wait for this. */
  claude: ClaudeState
  /** Tokens of the runs going now: each reaches the MCP tools, for its own card. */
  runTokens: Map<string, RunScope>
  /** Where the worker's MCP client reaches this server. */
  serverUrl: () => string
  apiToken: () => string
  /** The `claude` executable. */
  claudeBin: string
  /** The `codex` executable. */
  codexBin: string
  notify: (title: string, message: string) => Promise<void>
  /** Runs in flight (the step going now), so Stop can reach them. */
  handles: Map<number, RunHandle>
}

/** KAMMACRON_PASS_ENV: more variable names to hand on to what the worker starts (comma separated). */
const passedNames = () =>
  (process.env['KAMMACRON_PASS_ENV'] ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)

/** The values among them that are named like a secret: kept out of what runs print. */
export const passedSecrets = () =>
  passedNames()
    .filter((name) => /TOKEN|KEY|SECRET|PASSWORD/i.test(name))
    .flatMap((name) => process.env[name] ?? [])

/**
 * The process environment of everything the worker starts: a short allowlist and the saved PATH.
 * kammacron knows no tool's credentials; what a command logs in with is that command's own.
 */
export const childEnv = async (env: WorkerEnv) => {
  const settings = await getSettings(env.db)
  const base: Record<string, string> = {}
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
    ...passedNames(),
  ]) {
    const value = process.env[name]
    if (value !== undefined) base[name] = value
  }
  base['PATH'] = settings.worker_path ?? process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin'
  base['GIT_TERMINAL_PROMPT'] = '0'
  return base
}

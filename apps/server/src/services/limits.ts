import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'

import type { Executor } from '../db'
import { settings } from '../db/schema'

/**
 * How much of each agent's usage limits is spent: Claude's from the `rate_limit_event` its
 * stream-json carries (kept from kammacron's last Claude run), Codex's from the `rate_limits` its
 * own session files keep (any Codex session on this machine, the person's own too). Neither is a
 * documented interface: what does not read as expected is left out, never an error.
 */

/** One usage window: how long it is, how much of it is spent (0 to 1), and when it starts over. */
export type LimitWindow = {
  key: string
  minutes: number
  used: number
  resets_at: string | null
}

/** What `GET /api/limits` says of one agent; null for a CLI this machine has not. */
export type AgentLimits = {
  windows: LimitWindow[]
  /** The plan, when the agent says it (Codex does; Claude's stream does not). */
  plan: string | null
  /** When these numbers were read; null: none yet. */
  as_of: string | null
  /** Claude's: the run they came from. */
  run_id: number | null
}

/** Claude's windows, by the names its `unifiedWindows` uses. */
const CLAUDE_WINDOWS: Record<string, number> = { five_hour: 5 * 60, seven_day: 7 * 24 * 60 }

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Unix seconds as ISO time. */
const fromSeconds = (v: unknown) => {
  const n = num(v)
  return n === null ? null : new Date(n * 1000).toISOString()
}

/** The windows of a `rate_limit_event`'s `rate_limit_info`; none when it reads otherwise. */
export const claudeWindows = (info: unknown): LimitWindow[] =>
  Object.entries(record(record(info)['unifiedWindows'])).flatMap(([key, value]) => {
    const w = record(value)
    const used = num(w['utilization'])
    const minutes = CLAUDE_WINDOWS[key]
    if (used === null || minutes === undefined) return []
    return [{ key, minutes, used, resets_at: fromSeconds(w['resetsAt']) }]
  })

/** Keeps the windows of a Claude run's last `rate_limit_event`. */
export const recordClaudeLimits = async (db: Executor, runId: number, info: unknown) => {
  const windows = claudeWindows(info)
  if (!windows.length) return
  await db
    .update(settings)
    .set({ claude_limits: { windows, run_id: runId, at: new Date().toISOString() } })
    .where(eq(settings.id, 1))
}

/** Claude's windows as the last run left them. */
export const claudeLimits = async (db: Executor): Promise<AgentLimits> => {
  const [row] = await db.select({ limits: settings.claude_limits }).from(settings)
  const kept = record(row?.limits)
  return {
    windows: Array.isArray(kept['windows']) ? (kept['windows'] as LimitWindow[]) : [],
    plan: null,
    as_of: typeof kept['at'] === 'string' ? kept['at'] : null,
    run_id: num(kept['run_id']),
  }
}

/** A Codex `rate_limits` object as windows: `primary` and `secondary`, each a length and a percent. */
const codexWindows = (limits: unknown): LimitWindow[] =>
  (['primary', 'secondary'] as const).flatMap((key) => {
    const w = record(record(limits)[key])
    const used = num(w['used_percent'])
    const minutes = num(w['window_minutes'])
    if (used === null || minutes === null) return []
    return [{ key, minutes, used: used / 100, resets_at: fromSeconds(w['resets_at']) }]
  })

/** The `rate_limits` object anywhere in a session line (Codex nests it in its token counts). */
const findLimits = (v: unknown, depth = 0): unknown => {
  if (depth > 6 || !v || typeof v !== 'object') return null
  const r = record(v)
  if ('rate_limits' in r && r['rate_limits']) return r['rate_limits']
  for (const value of Object.values(r)) {
    const found = findLimits(value, depth + 1)
    if (found) return found
  }
  return null
}

/** The last bytes of a file: a session's newest lines are at its end. */
const tail = async (path: string, bytes = 512 * 1024) => {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    await file.read(buffer, 0, buffer.length, start)
    return buffer.toString('utf8')
  } finally {
    await file.close()
  }
}

/** Folders' entries, newest name first (`sessions/YYYY/MM/DD`), or none when it is missing. */
const newestFirst = async (dir: string) =>
  (await readdir(dir).catch(() => [] as string[])).sort().reverse()

/** The session files of the newest days, newest written first. */
const recentSessions = async (root: string) => {
  const files: { path: string; mtime: number }[] = []
  for (const year of (await newestFirst(root)).slice(0, 1))
    for (const month of (await newestFirst(join(root, year))).slice(0, 2))
      for (const day of (await newestFirst(join(root, year, month))).slice(0, 3))
        for (const name of await newestFirst(join(root, year, month, day)))
          if (name.endsWith('.jsonl')) {
            const path = join(root, year, month, day, name)
            files.push({ path, mtime: (await stat(path)).mtimeMs })
          }
  return files.sort((a, b) => b.mtime - a.mtime)
}

/** A session line's limits, when it holds `rate_limits` that read as windows. */
const limitsOfLine = (line: string, fileTime: number): AgentLimits | null => {
  if (!line.includes('"rate_limits"')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  const limits = findLimits(parsed)
  const windows = codexWindows(limits)
  if (!windows.length) return null
  const plan = record(limits)['plan_type']
  const at = record(parsed)['timestamp']
  return {
    windows,
    plan: typeof plan === 'string' ? plan : null,
    as_of: typeof at === 'string' ? at : new Date(fileTime).toISOString(),
    run_id: null,
  }
}

/** Codex's windows from its newest session file that has them. */
export const codexLimits = async (): Promise<AgentLimits> => {
  const home = process.env['CODEX_HOME'] ?? join(homedir(), '.codex')
  for (const file of (await recentSessions(join(home, 'sessions'))).slice(0, 5)) {
    for (const line of (await tail(file.path)).split('\n').reverse()) {
      const found = limitsOfLine(line, file.mtime)
      if (found) return found
    }
  }
  return { windows: [], plan: null, as_of: null, run_id: null }
}

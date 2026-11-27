import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { exec } from '../worker/git'
import { recentSessions, tail } from './limits'

/**
 * The Claude Code and Codex sessions open on this machine, whoever started them: a terminal, an
 * IDE, the desktop app, or kammacron. Read from what each tool keeps on disk and from the process
 * table; nothing here talks to either tool. Their files are not a published format, so every read
 * is forgiving: what cannot be read is left out, never an error.
 *
 * Claude Code writes `~/.claude/sessions/<pid>.json` for each process (`status`: busy, shell or
 * idle) and the conversation to `~/.claude/projects/<folder>/<session id>.jsonl`, with the tokens
 * of each answer. Codex writes `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, with `task_started`
 * and `task_complete` around a turn and the tokens of each.
 */

type Agent = 'claude' | 'codex'
/** working: a turn is going (tokens are spent); shell: it waits on a command it ran. */
type SessionStatus = 'working' | 'shell' | 'idle'
/** How the session pays: the account's plan, or an API key (by the token). */
type Billing = 'subscription' | 'api' | 'cloud' | 'unknown'

type Tokens = { input: number; output: number; cache_read: number; cache_write: number }

export type LocalSession = {
  agent: Agent
  /** The tool's own id of the conversation: `claude --resume <id>`, `codex resume <id>`. */
  id: string
  /** The process, when there is one of its own (a desktop app's thread has none). */
  pid: number | null
  name: string
  cwd: string
  status: SessionStatus
  /** Since when it is in that status (Claude says; for Codex, the turn's start). */
  status_since: string | null
  started_at: string | null
  /** The newest line of its conversation. */
  last_activity_at: string | null
  model: string | null
  billing: Billing
  /** Tokens of the answers in the last 5 minutes, and in the last hour. */
  tokens_5m: Tokens
  tokens_1h: Tokens
  /** Working (or in a command) and nothing written for 15 minutes: worth a look. */
  quiet: boolean
  /** Started by kammacron: the run it belongs to, stopped through the run. */
  run_id: number | null
  /** Stop can end it: it has a process of its own that is still the one the tool named. */
  stoppable: boolean
}

const QUIET_MS = 15 * 60_000
const FIVE_MIN = 5 * 60_000
const HOUR = 60 * 60_000
/** How long a Codex turn may sit open with no line written before it no longer counts as going. */
const CODEX_STALE_MS = 2 * HOUR

const claudeHome = () => process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
const codexHome = () => process.env['CODEX_HOME'] ?? join(homedir(), '.codex')

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const none = (): Tokens => ({ input: 0, output: 0, cache_read: 0, cache_write: 0 })
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

// ---------------------------------------------------------------- processes

type Proc = { pid: number; ppid: number; started: string; command: string; env: string }

/**
 * The processes asked for, in one `ps`: when each started (to tell a pid the OS gave to another
 * program since) and the names of the variables its environment holds. `ps eww` shows a process's
 * environment only to its own user, which kammacron is. Values are never kept, only which names
 * are there.
 */
const processes = async (pids: readonly number[]): Promise<Map<number, Proc>> => {
  const out = new Map<number, Proc>()
  if (pids.length === 0) return out
  const r = await exec(
    ['ps', 'eww', '-o', 'pid=,ppid=,lstart=,command=', '-p', [...new Set(pids)].join(',')],
    // in UTC, as Claude Code writes `procStart`
    { cwd: '/', env: { ...process.env, TZ: 'UTC' } },
  )
  for (const line of r.stdout.split('\n')) {
    // pid, ppid, then `lstart` (five words: Thu Nov 19 01:59:25 2026), then the command and its env
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line)
    if (!m) continue
    const rest = m[4] ?? ''
    const names = [...rest.matchAll(/(?:^|\s)([A-Z_][A-Z0-9_]*)=/g)].map((x) => x[1]).join(' ')
    out.set(Number(m[1]), {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      started: (m[3] ?? '').replace(/\s+/g, ' '),
      command: rest,
      env: ` ${names} `,
    })
  }
  return out
}

/** How a process pays, from its environment: an API key or a cloud provider, else the plan. */
const billingOf = (
  proc: Proc | undefined,
  apiVars: readonly string[],
  cloudVars: readonly string[],
) => {
  if (!proc) return 'unknown' as const
  if (cloudVars.some((v) => proc.env.includes(` ${v} `))) return 'cloud' as const
  if (apiVars.some((v) => proc.env.includes(` ${v} `))) return 'api' as const
  return 'subscription' as const
}

/** Whether the process the tool named is still that one: same pid, same start time. */
const sameProcess = (proc: Proc | undefined, started: string | null) =>
  proc !== undefined && (started === null || proc.started === started.replace(/\s+/g, ' '))

// ---------------------------------------------------------------- conversation tails

type Turn = { at: number; tokens: Tokens }
type Tail = { last: number | null; model: string | null; turns: Turn[]; open: number | null }

/** Each file's reading, kept while its size and time stay: a page asks every few seconds. */
const tails = new Map<string, { key: string; tail: Tail }>()

const readTail = async (path: string, parse: (text: string) => Tail): Promise<Tail | null> => {
  const info = await stat(path).catch(() => null)
  if (!info) return null
  const key = `${String(info.size)}:${String(info.mtimeMs)}`
  const hit = tails.get(path)
  if (hit?.key === key) return hit.tail
  const parsed = parse(await tail(path).catch(() => ''))
  parsed.last ??= info.mtimeMs
  tails.set(path, { key, tail: parsed })
  return parsed
}

const lines = function* (text: string) {
  // the first line of a tail may be cut: skip it unless the tail is the whole file
  const all = text.split('\n')
  for (const line of all.slice(text.startsWith('{') ? 0 : 1)) {
    if (!line.trim()) continue
    try {
      yield record(JSON.parse(line))
    } catch {
      // a line still being written
    }
  }
}

const atOf = (line: Record<string, unknown>) => {
  const t = str(line['timestamp'])
  const ms = t ? Date.parse(t) : NaN
  return Number.isNaN(ms) ? null : ms
}

/** Claude's answers: one usage per message (a message written in parts repeats it). */
const claudeTail = (text: string): Tail => {
  const out: Tail = { last: null, model: null, turns: [], open: null }
  const seen = new Set<string>()
  for (const line of lines(text)) {
    const at = atOf(line)
    if (at !== null) out.last = Math.max(out.last ?? 0, at)
    const message = record(line['message'])
    const usage = record(message['usage'])
    if (line['type'] !== 'assistant' || at === null || Object.keys(usage).length === 0) continue
    out.model = str(message['model']) ?? out.model
    const id = str(message['id']) ?? String(at)
    if (seen.has(id)) continue
    seen.add(id)
    out.turns.push({
      at,
      tokens: {
        input: num(usage['input_tokens']),
        output: num(usage['output_tokens']),
        cache_read: num(usage['cache_read_input_tokens']),
        cache_write: num(usage['cache_creation_input_tokens']),
      },
    })
  }
  return out
}

/** A `token_count` event's tokens of the last answer; null when it carries none. */
const codexTokens = (payload: Record<string, unknown>): Tokens | null => {
  const last = record(record(payload['info'])['last_token_usage'])
  if (Object.keys(last).length === 0) return null
  const cached = num(last['cached_input_tokens'])
  return {
    input: Math.max(0, num(last['input_tokens']) - cached),
    output: num(last['output_tokens']) + num(last['reasoning_output_tokens']),
    cache_read: cached,
    cache_write: 0,
  }
}

/** Codex's turns: `task_started` opens one, `task_complete` or an abort closes it. */
const codexTail = (text: string): Tail => {
  const out: Tail = { last: null, model: null, turns: [], open: null }
  for (const line of lines(text)) {
    const at = atOf(line)
    if (at !== null) out.last = Math.max(out.last ?? 0, at)
    const payload = record(line['payload'])
    const kind = str(payload['type'])
    if (line['type'] === 'turn_context') out.model = str(payload['model']) ?? out.model
    if (line['type'] !== 'event_msg' || at === null) continue
    if (kind === 'task_started') out.open = at
    if (kind === 'task_complete' || kind === 'turn_aborted') out.open = null
    const tokens = kind === 'token_count' ? codexTokens(payload) : null
    if (tokens) out.turns.push({ at, tokens })
  }
  return out
}

const sumSince = (turns: readonly Turn[], since: number): Tokens =>
  turns
    .filter((t) => t.at >= since)
    .reduce(
      (a, t) => ({
        input: a.input + t.tokens.input,
        output: a.output + t.tokens.output,
        cache_read: a.cache_read + t.tokens.cache_read,
        cache_write: a.cache_write + t.tokens.cache_write,
      }),
      none(),
    )

// ---------------------------------------------------------------- Claude

type ClaudeEntry = {
  pid: number
  sessionId: string
  name: string
  cwd: string
  status: string
  statusUpdatedAt: number | null
  startedAt: number | null
  procStart: string | null
}

const claudeEntries = async (home: string): Promise<ClaudeEntry[]> => {
  const dir = join(home, 'sessions')
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.json'))
  const out: ClaudeEntry[] = []
  for (const name of names) {
    const d = record(JSON.parse(await readFile(join(dir, name), 'utf8').catch(() => 'null')))
    const pid = num(d['pid'])
    const sessionId = str(d['sessionId'])
    if (!pid || !sessionId) continue
    out.push({
      pid,
      sessionId,
      name: str(d['name']) ?? sessionId.slice(0, 8),
      cwd: str(d['cwd']) ?? '',
      status: str(d['status']) ?? 'idle',
      statusUpdatedAt: typeof d['statusUpdatedAt'] === 'number' ? d['statusUpdatedAt'] : null,
      startedAt: typeof d['startedAt'] === 'number' ? d['startedAt'] : null,
      procStart: str(d['procStart']),
    })
  }
  return out
}

/** `projects/<folder>/<session id>.jsonl`, found by the id (the folder's name is the cwd, encoded). */
const transcripts = async (home: string): Promise<Map<string, string>> => {
  const root = join(home, 'projects')
  const out = new Map<string, string>()
  for (const folder of await readdir(root).catch(() => [] as string[]))
    for (const name of await readdir(join(root, folder)).catch(() => [] as string[]))
      if (name.endsWith('.jsonl'))
        out.set(name.slice(0, -'.jsonl'.length), join(root, folder, name))
  return out
}

const CLAUDE_STATUS: Record<string, SessionStatus> = { busy: 'working', shell: 'shell' }

const claudeSessions = async (now: number, runOf: (pid: number) => number | null) => {
  const home = claudeHome()
  const entries = await claudeEntries(home)
  const procs = await processes(entries.map((e) => e.pid))
  const files = entries.length ? await transcripts(home) : new Map<string, string>()
  const out: LocalSession[] = []
  for (const e of entries) {
    const proc = procs.get(e.pid)
    // a file left behind by a process that is gone (or whose pid now belongs to another program)
    if (!sameProcess(proc, e.procStart)) continue
    const path = files.get(e.sessionId)
    const t = path ? await readTail(path, claudeTail) : null
    const status = CLAUDE_STATUS[e.status] ?? 'idle'
    const last = t?.last ?? null
    const busySince = Math.max(last ?? 0, e.statusUpdatedAt ?? 0)
    out.push({
      agent: 'claude',
      id: e.sessionId,
      pid: e.pid,
      name: e.name,
      cwd: e.cwd,
      status,
      status_since: iso(e.statusUpdatedAt),
      started_at: iso(e.startedAt),
      last_activity_at: iso(last),
      model: t?.model ?? null,
      billing: billingOf(
        proc,
        ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
        ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'],
      ),
      tokens_5m: sumSince(t?.turns ?? [], now - FIVE_MIN),
      tokens_1h: sumSince(t?.turns ?? [], now - HOUR),
      quiet: status !== 'idle' && busySince > 0 && now - busySince > QUIET_MS,
      run_id: runOf(e.pid),
      stoppable: true,
    })
  }
  return out
}

// ---------------------------------------------------------------- Codex

/** Codex processes of their own (the terminal's `codex`, `codex exec`), not the app's server. */
const codexProcesses = async () => {
  const r = await exec(['ps', '-Ao', 'pid=,command='], { cwd: '/' })
  const pids: number[] = []
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\S+)(.*)$/.exec(line)
    if (!m) continue
    const bin = m[2] ?? ''
    if (!/(^|\/)codex$/.test(bin) || /\bapp-server\b/.test(m[3] ?? '')) continue
    pids.push(Number(m[1]))
  }
  const cwds = new Map<number, string>()
  for (const pid of pids) {
    const lsof = await exec(['lsof', '-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { cwd: '/' })
    const cwd = /^n(.+)$/m.exec(lsof.stdout)?.[1]
    if (cwd) cwds.set(pid, cwd)
  }
  return cwds
}

/** How Codex is signed in: `auth.json`'s mode (a ChatGPT plan, or an API key). */
const codexSignIn = async (home: string): Promise<Billing> => {
  const auth = record(
    JSON.parse(await readFile(join(home, 'auth.json'), 'utf8').catch(() => 'null')),
  )
  const mode = str(auth['auth_mode'])
  if (mode === 'chatgpt') return 'subscription'
  if (mode === 'apikey' || str(auth['OPENAI_API_KEY'])) return 'api'
  return 'unknown'
}

type CodexContext = {
  byCwd: Map<string, number[]>
  /** Processes already given a conversation: one each. */
  claimed: Set<number>
  procs: Map<number, Proc>
  signIn: Billing
  runOf: (pid: number) => number | null
}

/** The first line of a Codex session file: which conversation, where, and from what. */
const codexMeta = async (path: string) => {
  const first = (await readFile(path, 'utf8').catch(() => '')).split('\n', 1)[0]
  const head = record(JSON.parse(first ?? 'null'))
  const meta = record(head['payload'])
  const id = str(meta['id'])
  const cwd = str(meta['cwd'])
  if (head['type'] !== 'session_meta' || !id || !cwd) return null
  return { id, cwd, startedAt: str(meta['timestamp']) }
}

/** One Codex conversation, when it has a process of its own or a turn going; null otherwise. */
const codexSession = async (
  path: string,
  now: number,
  c: CodexContext,
): Promise<LocalSession | null> => {
  const meta = await codexMeta(path).catch(() => null)
  const t = meta ? await readTail(path, codexTail) : null
  if (!meta || !t) return null
  // the newest conversation in a folder belongs to the one codex process working there, if one is
  const pids = (c.byCwd.get(meta.cwd) ?? []).filter((p) => !c.claimed.has(p))
  const pid = pids.length === 1 ? (pids[0] ?? null) : null
  if (pid !== null) c.claimed.add(pid)
  const last = t.last
  const open = t.open !== null && now - (last ?? 0) < CODEX_STALE_MS
  if (pid === null && !open) return null
  const proc = pid === null ? undefined : c.procs.get(pid)
  const keyed = billingOf(proc, ['OPENAI_API_KEY', 'CODEX_API_KEY'], []) === 'api'
  return {
    agent: 'codex',
    id: meta.id,
    pid,
    name: `${meta.cwd.split('/').pop() ?? meta.cwd} (${meta.id.slice(-6)})`,
    cwd: meta.cwd,
    status: open ? 'working' : 'idle',
    status_since: open ? iso(t.open) : null,
    started_at: meta.startedAt,
    last_activity_at: iso(last),
    model: t.model,
    billing: keyed ? 'api' : c.signIn,
    tokens_5m: sumSince(t.turns, now - FIVE_MIN),
    tokens_1h: sumSince(t.turns, now - HOUR),
    quiet: open && last !== null && now - last > QUIET_MS,
    run_id: pid === null ? null : c.runOf(pid),
    stoppable: pid !== null,
  }
}

const codexSessions = async (now: number, runOf: (pid: number) => number | null) => {
  const home = codexHome()
  const files = (await recentSessions(join(home, 'sessions'))).filter(
    (f) => now - f.mtime < 24 * HOUR,
  )
  const byCwd = new Map<string, number[]>()
  for (const [pid, cwd] of await codexProcesses()) byCwd.set(cwd, [...(byCwd.get(cwd) ?? []), pid])
  const procs = await processes([...byCwd.values()].flat())
  const signIn = await codexSignIn(home)
  const out: LocalSession[] = []
  const claimed = new Set<number>()
  for (const file of files) {
    const found = await codexSession(file.path, now, { byCwd, claimed, procs, signIn, runOf })
    if (found) out.push(found)
  }
  // a codex open with no conversation of the last day: idle, and still its own process to end
  for (const [cwd, pids] of byCwd)
    for (const pid of pids.filter((p) => !claimed.has(p)))
      out.push(codexProcessOnly(pid, cwd, signIn, runOf(pid)))
  return out
}

const codexProcessOnly = (
  pid: number,
  cwd: string,
  billing: Billing,
  runId: number | null,
): LocalSession => ({
  agent: 'codex',
  id: `process-${String(pid)}`,
  pid,
  name: cwd.split('/').pop() ?? cwd,
  cwd,
  status: 'idle',
  status_since: null,
  started_at: null,
  last_activity_at: null,
  model: null,
  billing,
  tokens_5m: none(),
  tokens_1h: none(),
  quiet: false,
  run_id: runId,
  stoppable: true,
})

// ---------------------------------------------------------------- the list, and Stop

const ORDER: Record<SessionStatus, number> = { working: 0, shell: 1, idle: 2 }

/**
 * Every Claude Code and Codex session open on this machine, working ones first. `runOf` names the
 * kammacron run a process belongs to, when it is one of kammacron's.
 */
export const localSessions = async (
  runOf: (pid: number) => number | null = () => null,
): Promise<LocalSession[]> => {
  const now = Date.now()
  const [claude, codex] = await Promise.all([
    claudeSessions(now, runOf).catch(() => []),
    codexSessions(now, runOf).catch(() => []),
  ])
  return [...claude, ...codex].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''),
  )
}

/**
 * Whether the process still runs. One that has exited but that its parent has not yet waited for
 * (a zombie, `Z` in ps) answers a signal still: it counts as gone, since it runs nothing.
 */
const alive = async (pid: number) => {
  try {
    process.kill(pid, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return false
  }
  const ps = await exec(['ps', '-o', 'stat=', '-p', String(pid)], { cwd: '/' })
  const stat = ps.stdout.trim()
  return stat !== '' && !stat.startsWith('Z')
}

/**
 * Ends a session's process, as Ctrl+C twice would: SIGINT (the conversation is kept, and
 * `claude --resume` or `codex resume` takes it up again), then SIGTERM, then SIGKILL, a few
 * seconds apart, until it is gone. Only a pid the list gives now: never any process at all.
 */
export const stopProcess = async (pid: number, wait = (ms: number) => Bun.sleep(ms)) => {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
    try {
      process.kill(pid, signal)
    } catch {
      return true // gone already
    }
    for (let i = 0; i < 15; i++) {
      await wait(200)
      if (!(await alive(pid))) return true
    }
  }
  return !(await alive(pid))
}

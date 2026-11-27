/**
 * A run's events as the timeline draws them: each tool call paired with its result (so both can
 * say how long it took), what the call was (Bash, Edit, …), an edit's lines added and removed,
 * and a result that is the allowlist saying no. Only reads what the worker kept in `data`
 * (Claude's content blocks, Codex's items); what does not read as expected falls back to the
 * event's one-line summary.
 */

export type RunEventRow = {
  seq: number
  type: string
  summary: string
  data: unknown
  created_at: string | Date
}

type EventKind = 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'result'
type EventStatus = 'success' | 'error' | 'denied' | null
/** How the body is drawn: a dark command, a light mono line, or prose. */
type BodyLook = 'command' | 'mono' | 'text'

export type TimelineEvent = {
  seq: number
  kind: EventKind
  /** The tool's name for a call or its result ("Bash", "Edit"); the subtype for `system`. */
  tool: string | null
  icon: string
  status: EventStatus
  /** Milliseconds from a call to its result; null when there is no pair yet. */
  ms: number | null
  /** Lines an edit adds and removes; null for anything else. */
  diff: { added: number; removed: number } | null
  look: BodyLook
  /** One line, for the folded row. */
  preview: string
  /** Everything kept, for the opened row. */
  full: string
  at: Date
}

/** The groups the filter offers. */
export type EventFilter = 'all' | 'tools' | 'messages' | 'errors'

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** `data` as the worker kept it: over 8 KB it is a cut JSON string, read as nothing here. */
const dataOf = (e: RunEventRow) => {
  const d = record(e.data)
  return d['truncated'] === true ? {} : d
}

const lines = (text: string | null) => (text ? text.split('\n').length : 0)

/** A tool result's text: Claude's content is a string or text blocks; Codex's is its output. */
const resultText = (d: Record<string, unknown>) => {
  const content = d['content']
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((b) => str(record(b)['text']) ?? '')
      .join('\n')
      .trim()
  return str(d['aggregated_output'])
}

/** Claude Code's words when the allowlist refused a call. */
const DENIED =
  /permission to use|haven't granted|requested permissions|requires approval|denied by your permission|can't be checked before it runs/i

const ICONS: Record<string, string> = {
  Bash: 'terminal',
  Edit: 'pencil',
  MultiEdit: 'pencil',
  Write: 'pencil',
  NotebookEdit: 'pencil',
  Read: 'book',
  Grep: 'search',
  Glob: 'search',
  WebFetch: 'globe',
  WebSearch: 'globe',
  Task: 'bot',
  Agent: 'bot',
  TodoWrite: 'file-check',
}

const toolIcon = (tool: string | null) =>
  tool?.startsWith('mcp__') ? 'network' : (ICONS[tool ?? ''] ?? 'code')

/** The tool's name: from the block, else the summary's first word ("Bash git status"). */
const toolName = (e: RunEventRow, d: Record<string, unknown>) =>
  str(d['name']) ?? e.summary.split(' ')[0] ?? null

/** An edit's added and removed lines: Edit's old and new text, Write's content, MultiEdit's list. */
const diffOf = (tool: string | null, input: Record<string, unknown>) => {
  if (tool === 'Edit')
    return { added: lines(str(input['new_string'])), removed: lines(str(input['old_string'])) }
  if (tool === 'Write') return { added: lines(str(input['content'])), removed: 0 }
  if (tool === 'MultiEdit' && Array.isArray(input['edits']))
    return input['edits'].map(record).reduce<{ added: number; removed: number }>(
      (sum, e) => ({
        added: sum.added + lines(str(e['new_string'])),
        removed: sum.removed + lines(str(e['old_string'])),
      }),
      { added: 0, removed: 0 },
    )
  return null
}

/** What a call was asked to do, whole: the command, the path, else its input as JSON. */
const callText = (e: RunEventRow, d: Record<string, unknown>, tool: string | null) => {
  const input = record(d['input'])
  const command = str(input['command']) ?? str(d['command'])
  if (command) return command
  const path = str(input['file_path']) ?? str(input['pattern']) ?? str(input['url'])
  if (path) return path
  if (Object.keys(input).length) return JSON.stringify(input, null, 2)
  // the summary starts with the tool's name; the rest is what it was given
  return tool && e.summary.startsWith(tool) ? e.summary.slice(tool.length).trim() : e.summary
}

const at = (e: RunEventRow) => new Date(e.created_at)

type Pairs = { msOf: Map<number, number>; toolOfResult: Map<number, string | null> }

/** Each call with its result: Claude pairs them by id, Codex writes the result right after. */
const pairCalls = (events: readonly RunEventRow[]): Pairs => {
  const byId = new Map<string, RunEventRow>()
  const pairs: Pairs = { msOf: new Map(), toolOfResult: new Map() }
  let open: RunEventRow | null = null
  for (const e of events) {
    const d = dataOf(e)
    if (e.type === 'tool_use') {
      const id = str(d['id'])
      if (id) byId.set(id, e)
      open = e
    } else if (e.type === 'tool_result') {
      const id = str(d['tool_use_id'])
      const call = id ? byId.get(id) : open
      if (call) {
        const ms = at(e).getTime() - at(call).getTime()
        pairs.msOf.set(e.seq, ms)
        pairs.msOf.set(call.seq, ms)
        pairs.toolOfResult.set(e.seq, toolName(call, dataOf(call)))
      }
      open = null
    }
  }
  return pairs
}

type Base = Pick<TimelineEvent, 'seq' | 'kind' | 'at' | 'ms' | 'diff'>
type Row = (e: RunEventRow, d: Record<string, unknown>, base: Base, pairs: Pairs) => TimelineEvent

const toolUseRow: Row = (e, d, base) => {
  const tool = toolName(e, d)
  const full = callText(e, d, tool)
  return {
    ...base,
    tool,
    icon: toolIcon(tool),
    status: null,
    diff: diffOf(tool, record(d['input'])),
    look: tool === 'Bash' ? 'command' : 'mono',
    preview: full.replace(/\s+/g, ' ').trim(),
    full,
  }
}

/** A result's status: the allowlist said no, the tool failed, or it worked. */
const resultStatus = (e: RunEventRow, d: Record<string, unknown>, text: string) => {
  const exit = d['exit_code']
  const error =
    d['is_error'] === true ||
    e.summary.startsWith('error: ') ||
    (typeof exit === 'number' && exit !== 0)
  if (!error) return 'success'
  return DENIED.test(text) ? 'denied' : 'error'
}

const STATUS_ICON = { success: 'check', error: 'close', denied: 'shield' } as const

const toolResultRow: Row = (e, d, base, pairs) => {
  const text = resultText(d) ?? e.summary.replace(/^error: /, '')
  const status = resultStatus(e, d, text)
  const full = text.trim() || '(empty)'
  return {
    ...base,
    tool: pairs.toolOfResult.get(e.seq) ?? null,
    icon: STATUS_ICON[status],
    status,
    look: 'mono',
    preview: full.replace(/\s+/g, ' ').trim(),
    full,
  }
}

const assistantRow: Row = (e, d, base) => ({
  ...base,
  tool: null,
  icon: 'sparkles',
  status: null,
  look: 'text',
  preview: e.summary,
  full: str(d['text']) ?? e.summary,
})

const resultRow: Row = (e, d, base) => {
  const error = d['is_error'] === true || d['type'] === 'turn.failed' || d['type'] === 'error'
  return {
    ...base,
    tool: null,
    icon: error ? 'close' : 'file-check',
    status: error ? 'error' : 'success',
    look: 'text',
    preview: e.summary,
    full: str(d['result']) ?? e.summary,
  }
}

const SYSTEM_ICON: Record<string, string> = {
  thinking_tokens: 'sparkles',
  permission_denied: 'shield',
}

/** System lines are many and alike: only `init` says something (the model and the session). */
const systemRow: Row = (e, d, base) => {
  const subtype = str(d['subtype']) ?? e.summary
  const line = [str(d['model']), str(d['session_id']) ?? str(d['thread_id'])]
    .filter(Boolean)
    .join(' · ')
  return {
    ...base,
    tool: subtype,
    icon: SYSTEM_ICON[subtype] ?? 'settings',
    status: null,
    look: 'mono',
    preview: subtype === 'init' ? line : '',
    full: line,
  }
}

const ROWS: Record<EventKind, Row> = {
  tool_use: toolUseRow,
  tool_result: toolResultRow,
  assistant: assistantRow,
  result: resultRow,
  system: systemRow,
}

const isKind = (type: string): type is EventKind => type in ROWS

/**
 * Rows built before, by the event they came from. A live run's events keep their identity from
 * one answer to the next, so a new event costs one row, not the whole timeline again; a row is
 * built anew only when its call's result arrives (its time and tool change).
 */
const built = new WeakMap<RunEventRow, TimelineEvent>()

/** The events, newest last, ready to draw. */
export const timelineEvents = (events: readonly RunEventRow[]): TimelineEvent[] => {
  const pairs = pairCalls(events)
  return events.map((e) => {
    const ms = pairs.msOf.get(e.seq) ?? null
    const kept = built.get(e)
    if (
      kept?.ms === ms &&
      (e.type !== 'tool_result' || kept.tool === (pairs.toolOfResult.get(e.seq) ?? null))
    )
      return kept
    const kind = isKind(e.type) ? e.type : 'system'
    const row = ROWS[kind](e, dataOf(e), { seq: e.seq, kind, at: at(e), ms, diff: null }, pairs)
    built.set(e, row)
    return row
  })
}

/**
 * Two lists of a run's events as one, oldest first, each seq once: an event already held keeps
 * its object (and so its built row). The same list back when `more` adds nothing.
 */
export const mergeEvents = (
  held: readonly RunEventRow[],
  more: readonly RunEventRow[],
): readonly RunEventRow[] => {
  const bySeq = new Map(held.map((e) => [e.seq, e]))
  const added = more.filter((e) => !bySeq.has(e.seq))
  if (!added.length) return held
  const last = held.at(-1)?.seq ?? 0
  // the usual case, a live run's newest events: they go on the end
  if (added.every((e) => e.seq > last)) return [...held, ...added]
  return [...held, ...added].sort((a, b) => a.seq - b.seq)
}

/** Whether an event belongs to a filter's group. */
export const inFilter = (e: TimelineEvent, filter: EventFilter): boolean => {
  switch (filter) {
    case 'tools':
      return e.kind === 'tool_use' || e.kind === 'tool_result'
    case 'messages':
      return e.kind === 'assistant' || e.kind === 'result'
    case 'errors':
      return e.status === 'error' || e.status === 'denied'
    case 'all':
    default:
      return true
  }
}

/** "318 ms", "4.2 s", "2 min 5 s". */
export const took = (ms: number): string => {
  if (ms < 1000) return `${String(Math.max(0, Math.round(ms)))} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  return `${String(Math.floor(s / 60))} min ${String(s % 60)} s`
}

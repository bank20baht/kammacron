/** What a schedule runs: a shell command, a coding agent with a prompt, or one of the project's playbooks. */
export const SCHEDULE_KINDS = ['claude', 'codex', 'command', 'playbook'] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/** How its time is picked: an interval, a preset the GUI turns into cron, or cron as typed. */
export const TIMINGS = ['interval', 'hourly', 'daily', 'weekdays', 'weekly', 'cron'] as const
export type Timing = (typeof TIMINGS)[number]

/** `HH:MM` as `[hour, minute]`; null when it is not a time of day. */
const hourMinute = (value: unknown): [number, number] | null => {
  const match = typeof value === 'string' ? /^(\d{1,2}):(\d{2})/.exec(value.trim()) : null
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? [h, m] : null
}

/** A whole number in `[lo, hi]`, or null. */
const inRange = (value: unknown, lo: number, hi: number) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

/**
 * The cron expression a timing and its fields mean (`minute`, `time`, `weekday`, `cron`); null
 * for `interval`, or while a field it needs is missing.
 */
export const cronOf = (timing: Timing, data: Record<string, unknown>): string | null => {
  const time = hourMinute(data['time'])
  switch (timing) {
    case 'interval':
      return null
    case 'hourly': {
      const minute = inRange(data['minute'] ?? 0, 0, 59)
      return minute === null ? null : `${String(minute)} * * * *`
    }
    case 'daily':
      return time ? `${String(time[1])} ${String(time[0])} * * *` : null
    case 'weekdays':
      return time ? `${String(time[1])} ${String(time[0])} * * 1-5` : null
    case 'weekly': {
      const day = inRange(data['weekday'], 0, 6)
      return time && day !== null
        ? `${String(time[1])} ${String(time[0])} * * ${String(day)}`
        : null
    }
    case 'cron': {
      const typed = typeof data['cron'] === 'string' ? data['cron'].trim().replace(/\s+/g, ' ') : ''
      return typed || null
    }
  }
}

/** A schedule as `GET /projects/:id/schedules` lists it, as far as its line needs. */
type ScheduleLike = {
  command: string | null
  playbook: string | null
  agent: string | null
  prompt: string | null
}

/** What a schedule runs, in one short line: its command, `playbook:<name>`, or `codex: <prompt>`. */
export const runsWhat = (s: ScheduleLike): string => {
  if (s.agent) {
    const first = (s.prompt ?? '').trim().split('\n')[0] ?? ''
    return `${s.agent}: ${first.length > 80 ? `${first.slice(0, 79)}…` : first}`
  }
  return s.command ?? `playbook:${s.playbook ?? ''}`
}

/** What names a run: the card a worker round ran (`#12 title`), or the cron job that started it. */
export const runLabel = (run: {
  card_id: number | null
  card_title: string | null
  schedule_name?: string | null
}): string =>
  run.card_id === null
    ? (run.schedule_name ?? '')
    : `#${String(run.card_id)} ${run.card_title ?? ''}`

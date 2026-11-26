import type { Translate } from '../core/i18n/i18n.service'

/** What a schedule runs: a shell command, a coding agent with a prompt, or one of the project's playbooks. */
export const SCHEDULE_KINDS = ['claude', 'codex', 'command', 'playbook'] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/**
 * When a job runs. The field's value is a cron expression, a string (`"30 7 * * 2,4"`); the
 * picker holds it as a `SchedulePick` while it is being set, the way an alarm clock is set: on
 * some days of the week at a time, every few minutes, every hour at a minute, or the five fields
 * of cron typed in.
 */
type ScheduleMode = 'date' | 'interval' | 'hourly' | 'cron'

export type SchedulePick = {
  mode: ScheduleMode
  /** `HH:MM`, for `date`. */
  time: string
  /** Cron's day numbers (0 = Sunday … 6 = Saturday), for `date`. */
  days: number[]
  /** Minutes between runs, for `interval`: one of `INTERVALS` (a cron step must divide the hour). */
  every: number
  /** The minute past the hour, for `hourly`. */
  minute: number
  /** The five fields as typed, for `cron`: minute, hour, day of month, month, day of week. */
  parts: string[]
}

/** Monday first, as a week is read; the numbers are cron's. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

/** "Every N min": the steps that divide an hour, so a cron step runs evenly. */
export const INTERVALS = [5, 10, 15, 20, 30] as const

/** The five fields' names, in order, and the numbers each may hold. */
export const CRON_PARTS = [
  { key: 'minute', min: 0, max: 59 },
  { key: 'hour', min: 0, max: 23 },
  { key: 'day', min: 1, max: 31 },
  { key: 'month', min: 1, max: 12 },
  { key: 'weekday', min: 0, max: 7 },
] as const

export const DEFAULT_CRON = '0 9 * * 1'

const MACROS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

/** Whitespace folded, a macro spelt out; null when it is not five fields. */
export const fieldsOf = (cron: string): string[] | null => {
  const text = cron.trim().replace(/\s+/g, ' ')
  const parts = (MACROS[text.toLowerCase()] ?? text).split(' ')
  return parts.length === 5 ? parts : null
}

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : null)

/** Is one field's text cron for its range: `*`, `n`, `a-b`, a `/step`, and lists of those. */
export const partValid = (text: string, index: number): boolean => {
  const spec = CRON_PARTS[index]
  if (!spec || !text) return false
  return text.split(',').every((item) => {
    const [range = '', step] = item.split('/')
    if (step !== undefined && !((num(step) ?? 0) >= 1)) return false
    if (range === '*') return true
    const [a = '', b] = range.split('-')
    const lo = num(a)
    const hi = b === undefined ? lo : num(b)
    return lo !== null && hi !== null && lo >= spec.min && hi <= spec.max && lo <= hi
  })
}

/** Why a cron expression is not one (a message key), or null. The server checks its next time too. */
export const cronProblem = (cron: unknown): 'cron' | null => {
  const parts = typeof cron === 'string' ? fieldsOf(cron) : null
  return parts?.every((part, i) => partValid(part, i)) ? null : 'cron'
}

/** The days of a day-of-week field, when it is plain numbers, ranges and `*`; else null. */
const daysOf = (field: string): number[] | null => {
  if (field === '*') return [...WEEK]
  const days = new Set<number>()
  for (const item of field.split(',')) {
    const [a = '', b] = item.split('-')
    const lo = num(a)
    const hi = b === undefined ? lo : num(b)
    if (lo === null || hi === null || lo > hi || hi > 7) return null
    for (let d = lo; d <= hi; d++) days.add(d % 7)
  }
  return [...days]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A cron expression read back into the picker: the mode that says it, else the five fields. */
export const pickOf = (cron: unknown): SchedulePick => {
  const text = typeof cron === 'string' && cron.trim() ? cron : DEFAULT_CRON
  const parts = fieldsOf(text)
  const base: SchedulePick = {
    mode: 'cron',
    time: '09:00',
    days: [1],
    every: 15,
    minute: 0,
    parts: parts ?? text.trim().split(/\s+/),
  }
  if (!parts) return base
  const [m = '', h = '', dom = '', mon = '', dow = ''] = parts
  if (dom !== '*' || mon !== '*') return base
  const step = /^\*\/(\d+)$/.exec(m)
  if (
    step &&
    h === '*' &&
    dow === '*' &&
    (INTERVALS as readonly number[]).includes(Number(step[1]))
  )
    return { ...base, mode: 'interval', every: Number(step[1]) }
  const minute = num(m)
  if (minute === null || minute > 59) return base
  if (h === '*' && dow === '*') return { ...base, mode: 'hourly', minute }
  const hour = num(h)
  const days = daysOf(dow)
  if (hour === null || hour > 23 || !days) return base
  return { ...base, mode: 'date', time: `${pad(hour)}:${pad(minute)}`, days }
}

/** `HH:MM` as `[hour, minute]`; null when it is not a time of day. */
const hourMinute = (value: string): [number, number] | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? [h, m] : null
}

/** The day-of-week field: `*` for every day, `1-5` for weekdays, else a list (`2,4`). */
const dayField = (days: readonly number[]) => {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return '*'
  if (sorted.join(',') === '1,2,3,4,5') return '1-5'
  return sorted.join(',')
}

type Problem = 'noDay' | 'time' | 'every' | 'minute' | 'cron'

const PROBLEMS: Record<ScheduleMode, (s: SchedulePick) => Problem | null> = {
  date: (s) => {
    if (!hourMinute(s.time)) return 'time'
    return s.days.length === 0 ? 'noDay' : null
  },
  interval: (s) => ((INTERVALS as readonly number[]).includes(s.every) ? null : 'every'),
  hourly: (s) => (Number.isInteger(s.minute) && s.minute >= 0 && s.minute <= 59 ? null : 'minute'),
  cron: (s) => cronProblem(s.parts.join(' ')),
}

/** What is missing from a pick (a message key), or null when it makes a cron expression. */
export const pickProblem = (s: SchedulePick): Problem | null => PROBLEMS[s.mode](s)

/** The cron expression a pick makes; null while something it needs is missing. */
export const cronOfPick = (s: SchedulePick): string | null => {
  if (pickProblem(s)) return null
  switch (s.mode) {
    case 'date': {
      const [h, m] = hourMinute(s.time) ?? [0, 0]
      return `${String(m)} ${String(h)} * * ${dayField(s.days)}`
    }
    case 'interval':
      return `*/${String(s.every)} * * * *`
    case 'hourly':
      return `${String(s.minute)} * * * *`
    case 'cron':
      return s.parts.map((p) => p.trim()).join(' ')
  }
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export const dayKey = (d: number) => DAY_KEYS[d] ?? 'mon'

/** "a, b and c" in the locale's words. */
const listOf = (t: Translate, items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : t('forms.schedule.picker.list', {
        head: items.slice(0, -1).join(', '),
        last: items.at(-1) ?? '',
      })

const P = 'forms.schedule.picker.summary'

/** The days and time in words: every day, weekdays, weekends, one day, or a list of them. */
const dateSummary = (t: Translate, s: SchedulePick): string => {
  const time = s.time
  const days = dayField(s.days)
  if (days === '*') return t(`${P}.everyDay`, { time })
  if (days === '1-5') return t(`${P}.weekdays`, { time })
  if (days === '0,6') return t(`${P}.weekends`, { time })
  const sorted = WEEK.filter((d) => s.days.includes(d))
  if (sorted.length === 1)
    return t(`${P}.oneDay`, { day: t(`forms.schedule.day.${dayKey(sorted[0] ?? 1)}`), time })
  const names = sorted.map((d) => t(`forms.schedule.dayShort.${dayKey(d)}`))
  return t(`${P}.days`, { days: listOf(t, names), time })
}

/** A pick in a sentence: "Runs on Tue and Thu at 09:00", "Runs every 15 minutes". */
export const pickSummary = (t: Translate, s: SchedulePick): string => {
  if (pickProblem(s)) return t(`${P}.incomplete`)
  switch (s.mode) {
    case 'date':
      return dateSummary(t, s)
    case 'interval':
      return t(`${P}.interval`, { minutes: s.every })
    case 'hourly':
      return t(`${P}.hourly`, { minute: s.minute })
    case 'cron':
      return t(`${P}.cron`)
  }
}

/** A cron expression in a sentence, read through the picker (the read-only display of the field). */
export const cronSummary = (t: Translate, cron: unknown): string => pickSummary(t, pickOf(cron))

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

import { invalid } from './errors'

/**
 * Five-field cron (`minute hour day-of-month month day-of-week`), in the server's local time.
 * Each field takes `*`, numbers, `a-b` ranges, `,` lists and `/n` steps; day-of-week is 0-7
 * (0 and 7 are Sunday). As in Vixie cron, when both day fields are restricted a day matching
 * either one runs. `@hourly`, `@daily`, `@weekly`, `@monthly` and `@yearly` are short for theirs.
 */
type Cron = {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
  domAny: boolean
  dowAny: boolean
}

const MACROS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
] as const

const bad = (expr: string, why: string) => invalid('BAD_CRON', `"${expr}": ${why}`)

const toInt = (expr: string, text: string, field: string) => {
  if (!/^\d+$/.test(text)) throw bad(expr, `${field}: "${text}" is not a number`)
  return Number(text)
}

type Spec = (typeof FIELDS)[number]

/** `*`, `a` or `a-b` as `[lo, hi]`; a lone `a` with a step runs to the field's end (`5/15`). */
const bounds = (expr: string, range: string, stepped: boolean, spec: Spec): [number, number] => {
  if (range === '*') return [spec.min, spec.max]
  const [a = '', b] = range.split('-')
  const lo = toInt(expr, a, spec.name)
  if (b !== undefined) return [lo, toInt(expr, b, spec.name)]
  return [lo, stepped ? spec.max : lo]
}

const parseField = (expr: string, text: string, spec: Spec) => {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const [range = '', stepText] = part.split('/')
    const step = stepText === undefined ? 1 : toInt(expr, stepText, spec.name)
    if (step < 1) throw bad(expr, `${spec.name}: a step must be 1 or more`)
    const [lo, hi] = bounds(expr, range, stepText !== undefined, spec)
    if (lo < spec.min || hi > spec.max || lo > hi)
      throw bad(expr, `${spec.name}: "${part}" is outside ${String(spec.min)}-${String(spec.max)}`)
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

export const parseCron = (expression: string): Cron => {
  const expr = expression.trim()
  const parts = (MACROS[expr.toLowerCase()] ?? expr).split(/\s+/)
  if (parts.length !== 5)
    throw bad(expr, 'needs 5 fields: minute hour day-of-month month day-of-week')
  const [minute, hour, dom, month, dow] = FIELDS.map((spec, i) =>
    parseField(expr, parts[i] ?? '', spec),
  ) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>]
  if (dow.has(7)) dow.add(0)
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    domAny: parts[2] === '*',
    dowAny: parts[4] === '*',
  }
}

const dayMatches = (c: Cron, d: Date) => {
  const byDom = c.dom.has(d.getDate())
  const byDow = c.dow.has(d.getDay())
  if (c.domAny && c.dowAny) return true
  if (c.domAny) return byDow
  if (c.dowAny) return byDom
  return byDom || byDow
}

/** The first minute after `from` (strictly) that the expression names; null if none in 5 years. */
export const nextCron = (expression: string, from: Date = new Date()): Date | null => {
  const c = parseCron(expression)
  const at = new Date(from)
  at.setSeconds(0, 0)
  at.setMinutes(at.getMinutes() + 1)
  const limit = from.getTime() + 5 * 366 * 86_400_000
  while (at.getTime() <= limit) {
    if (!c.month.has(at.getMonth() + 1)) {
      at.setMonth(at.getMonth() + 1, 1)
      at.setHours(0, 0, 0, 0)
    } else if (!dayMatches(c, at)) {
      at.setDate(at.getDate() + 1)
      at.setHours(0, 0, 0, 0)
    } else if (!c.hour.has(at.getHours())) {
      at.setHours(at.getHours() + 1, 0, 0, 0)
    } else if (!c.minute.has(at.getMinutes())) {
      at.setMinutes(at.getMinutes() + 1, 0, 0)
    } else return at
  }
  return null
}

/**
 * The times the expression names in `[from, to)`: at most `perDay` of each (local) day, then on
 * to the next day, and at most `cap` in all. A job every 5 minutes over a month is 8640 times;
 * a calendar needs each day's first few (to see how often, and that the day has runs), not all.
 */
export const cronTimes = (
  expression: string,
  from: Date,
  to: Date,
  cap = 2000,
  perDay = 48,
): Date[] => {
  const out: Date[] = []
  let day = ''
  let inDay = 0
  let at = nextCron(expression, new Date(from.getTime() - 60_000))
  while (at && at < to && out.length < cap) {
    const key = at.toDateString()
    if (key !== day) {
      day = key
      inDay = 0
    }
    if (inDay < perDay) {
      out.push(at)
      inDay++
      at = nextCron(expression, at)
    } else {
      const midnight = new Date(at)
      midnight.setHours(24, 0, 0, 0)
      at = nextCron(expression, new Date(midnight.getTime() - 60_000))
    }
  }
  return out
}

/** When a schedule runs next after `from`: its cron expression's next time, or its interval on. */
export const nextScheduleRun = (
  schedule: { cron: string | null; interval_minutes: number },
  from: Date = new Date(),
): Date =>
  (schedule.cron ? nextCron(schedule.cron, from) : null) ??
  new Date(from.getTime() + schedule.interval_minutes * 60_000)

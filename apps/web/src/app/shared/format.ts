const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

/** "3 minutes ago", "in 2 hours", from a date or an ISO string. */
export const ago = (value: string | Date | null | undefined, now = Date.now()): string => {
  if (value === null || value === undefined) return '—'
  let amount = (new Date(value).getTime() - now) / 1000
  for (const [unit, size] of STEPS) {
    if (Math.abs(amount) < size) return relative.format(Math.round(amount), unit)
    amount /= size
  }
  return '—'
}

/** "4m 12s", "1h 03m", between two dates (now when the end is missing). */
export const duration = (start: string | Date, end?: string | Date | null): string => {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${String(s)}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${String(m)}m ${String(s % 60).padStart(2, '0')}s`
  return `${String(Math.floor(m / 60))}h ${String(m % 60).padStart(2, '0')}m`
}

const usd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

/** API-equivalent cost, as Claude Code reports it ($0.42). */
export const cost = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : usd.format(value)

/** "2026-11-25 09:30", local time. */
export const stamp = (value: string | Date | null | undefined): string => {
  if (!value) return '—'
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

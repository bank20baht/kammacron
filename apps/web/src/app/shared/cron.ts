import type { Translate } from '../core/i18n/i18n.service'

/** A job that runs on a timer, as `GET /api/calendar` lists it. */
export type CronJobLike = {
  every_minutes: number
  next_at: string | null
  off: string | null
  /** A cron schedule's times in the range asked for; then the interval says nothing. */
  times?: string[] | null
}

/** Jobs that run this often or more read as one line a day, not a mark per run. */
export const FREQUENT_MINUTES = 120

/**
 * When a job runs in `[from, to)`: its next time, then every interval. Nothing for a job that
 * is off or has no next time; at most `cap` times. A next time already past counts from now.
 */
export const occurrences = (
  job: CronJobLike,
  from: Date,
  to: Date,
  now: Date = new Date(),
  cap = 400,
): Date[] => {
  if (job.off !== null) return []
  if (job.times) {
    const listed = job.times.map((t) => new Date(t))
    return listed.filter((d) => d >= from && d < to && d >= now).slice(0, cap)
  }
  if (job.next_at === null || job.every_minutes <= 0) return []
  const step = job.every_minutes * 60_000
  let at = Math.max(new Date(job.next_at).getTime(), now.getTime())
  if (at < from.getTime()) at += Math.ceil((from.getTime() - at) / step) * step
  const out: Date[] = []
  for (; at < to.getTime() && out.length < cap; at += step) out.push(new Date(at))
  return out
}

/** How far apart a job's runs are, in minutes: its interval, or the shortest gap of its cron times. */
export const gapMinutes = (job: CronJobLike, times: readonly Date[]): number => {
  if (!job.times) return job.every_minutes
  let gap = Infinity
  for (let i = 1; i < times.length; i++)
    gap = Math.min(gap, ((times[i]?.getTime() ?? 0) - (times[i - 1]?.getTime() ?? 0)) / 60_000)
  return gap
}

/** `YYYY-MM-DD` of a local day. */
export const dayKey = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The local days, `YYYY-MM-DD`, a job runs on in `[from, to)`. */
export const daysWith = (times: Date[]): string[] => [...new Set(times.map(dayKey))]

/** `every 30 min`, `every 6 h`, `daily`, `every 3 days`, in the locale's words. */
export const every = (t: Translate, minutes: number): string => {
  if (minutes % 1440 === 0) return t('calendar.every.days', { count: minutes / 1440 })
  if (minutes % 60 === 0) return t('calendar.every.hours', { count: minutes / 60 })
  return t('calendar.every.minutes', { count: minutes })
}

import { duration as span, money, relativeTime } from '@20baht/formats'

import { currentLocale } from '../core/i18n/i18n.service'

/* Every format reads the app's locale (core/i18n), so it follows a change of language. */

/** "3 minutes ago", "in 2 hours"; `—` when there is no date. */
export const ago = (value: string | Date | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : relativeTime(value, { locale: currentLocale() }) || '—'

/** "4m 12s", "1h 3m", between two dates (now when the end is missing). */
export const duration = (start: string | Date, end?: string | Date | null): string =>
  span(Math.max(0, (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()), {
    locale: currentLocale(),
  })

/** API-equivalent cost, as Claude Code reports it, with cents ($0.42). */
export const cost = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : money(value, 'USD', { locale: currentLocale() }) || '—'

/** "2026-11-25 09:30", local time. */
export const stamp = (value: string | Date | null | undefined): string => {
  if (!value) return '—'
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

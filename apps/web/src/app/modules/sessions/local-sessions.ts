import { currentLocale } from '../../core/i18n/i18n.service'

/** One session of the machine, as `GET /api/local-sessions` answers it. */
export type LocalSession = {
  agent: 'claude' | 'codex'
  id: string
  pid: number | null
  name: string
  cwd: string
  status: 'working' | 'shell' | 'idle'
  status_since: string | null
  started_at: string | null
  last_activity_at: string | null
  model: string | null
  billing: 'subscription' | 'api' | 'cloud' | 'unknown'
  tokens_5m: { input: number; output: number; cache_read: number; cache_write: number }
  tokens_1h: { input: number; output: number; cache_read: number; cache_write: number }
  quiet: boolean
  run_id: number | null
  stoppable: boolean
}

/** Working (a turn going, or a command it waits on) above idle; the list keeps its order. */
export const sessionGroups = (all: readonly LocalSession[]) => [
  { key: 'working' as const, sessions: all.filter((s) => s.status !== 'idle') },
  ...(all.some((s) => s.status === 'idle')
    ? [{ key: 'idle' as const, sessions: all.filter((s) => s.status === 'idle') }]
    : []),
]

/** How many are in each status, and how many of the working ones look stuck. */
export const summaryOf = (all: readonly LocalSession[]) => ({
  working: all.filter((s) => s.status === 'working').length,
  shell: all.filter((s) => s.status === 'shell').length,
  idle: all.filter((s) => s.status === 'idle').length,
  quiet: all.filter((s) => s.quiet).length,
})

/** A count of tokens in a few characters: 950, 25.6K, 1.2M. */
export const compact = (n: number): string =>
  new Intl.NumberFormat(currentLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(
    n,
  )

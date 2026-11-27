import { and, asc, eq, gte, lt } from 'drizzle-orm'

import type { Db } from '../db'
import { cards, projects, runs, schedules } from '../db/schema'
import { cronTimes } from './cron'
import { getSettings } from './settings'

/** How often the housekeeping runs, from the process start. */
export const HOUSEKEEPING_MINUTES = 24 * 60

/** What the worker loop says of itself; null where it does not run. */
type LoopStatus = { housekeeping_at: string | null } | null

/** What runs on its own: a project's worker round, a project's schedule, the daily housekeeping. */
type CronKind = 'worker' | 'schedule' | 'housekeeping'

export type CronJob = {
  /** `worker:<project>`, `schedule:<id>`, `housekeeping`. */
  key: string
  kind: CronKind
  name: string
  project_id: number | null
  project_name: string | null
  project_slug: string | null
  /** What a schedule runs: its command, `playbook <name>`, or `claude: <prompt>`; null for the others. */
  command: string | null
  every_minutes: number
  /** A schedule's cron expression; null when it runs every `every_minutes`. */
  cron: string | null
  /** With a cron expression: the times it runs in the range asked for (the interval says nothing). */
  times: string[] | null
  /** When it runs next; null when it is off or the time is not known yet. */
  next_at: string | null
  last_at: string | null
  /** `no cards`, `ran 2 cards`, `exit 1`… */
  last_result: string | null
  /** Why it does not run now (`worker off`, `paused: rate limit`); null when it runs. */
  off: string | null
}

type ProjectRow = typeof projects.$inferSelect

const iso = (d: Date | null) => d?.toISOString() ?? null

/** Why a project's round does not run now, or null. */
const projectOff = (project: ProjectRow, allPaused: boolean, hasWorker: boolean): string | null => {
  if (!hasWorker) return 'worker not running in this process'
  if (allPaused) return 'all work paused'
  if (project.archived) return 'project archived'
  if (!project.worker_enabled) return 'worker off'
  if (project.paused_reason) return `paused: ${project.paused_reason}`
  if (!project.repo_path) return 'no repo path'
  return null
}

type ScheduleRow = typeof schedules.$inferSelect

const workerJob = (p: ProjectRow, off: string | null): CronJob => ({
  key: `worker:${String(p.id)}`,
  kind: 'worker',
  name: 'Worker round',
  project_id: p.id,
  project_name: p.name,
  project_slug: p.slug,
  command: null,
  every_minutes: p.interval_minutes,
  cron: null,
  times: null,
  next_at: off ? null : (iso(p.next_run_at) ?? new Date().toISOString()),
  last_at: iso(p.last_checked_at),
  last_result: p.last_check_result,
  off,
})

/** What a schedule runs, in a line. */
const whatRuns = (s: ScheduleRow) => {
  if (s.agent) return `${s.agent}: ${(s.prompt ?? '').trim().split('\n')[0]?.slice(0, 120) ?? ''}`
  return s.command ?? `playbook ${s.playbook ?? ''}`
}

/** The range the calendar asks about. */
type Range = { from: Date; to: Date }

const scheduleJob = (
  s: ScheduleRow,
  p: ProjectRow,
  off: string | null,
  range: Range | null,
): CronJob => ({
  key: `schedule:${String(s.id)}`,
  kind: 'schedule',
  name: s.name,
  project_id: p.id,
  project_name: p.name,
  project_slug: p.slug,
  command: whatRuns(s),
  every_minutes: s.interval_minutes,
  cron: s.cron,
  times:
    s.cron && range && !off
      ? cronTimes(s.cron, new Date(Math.max(range.from.getTime(), Date.now())), range.to).map((d) =>
          d.toISOString(),
        )
      : null,
  next_at: off ? null : (iso(s.next_run_at) ?? new Date().toISOString()),
  last_at: iso(s.last_run_at),
  last_result:
    s.last_result ?? (s.last_exit_code === null ? null : `exit ${String(s.last_exit_code)}`),
  off,
})

const housekeepingJob = (status: LoopStatus): CronJob => {
  const last = status?.housekeeping_at ? new Date(status.housekeeping_at) : null
  return {
    key: 'housekeeping',
    kind: 'housekeeping',
    name: 'Housekeeping',
    project_id: null,
    project_name: null,
    project_slug: null,
    command: null,
    every_minutes: HOUSEKEEPING_MINUTES,
    cron: null,
    times: null,
    next_at: last ? new Date(last.getTime() + HOUSEKEEPING_MINUTES * 60_000).toISOString() : null,
    last_at: iso(last),
    last_result: last ? 'data past its retention (Settings → Data) and orphan files removed' : null,
    off: status === null ? 'worker not running in this process' : null,
  }
}

/** Why a project's schedules do not run now, or null: they need no worker switch, only a directory. */
const schedulesOff = (project: ProjectRow, allPaused: boolean, hasWorker: boolean) => {
  if (!hasWorker) return 'worker not running in this process'
  if (allPaused) return 'all work paused'
  if (project.paused_reason) return `paused: ${project.paused_reason}`
  if (!project.repo_path) return 'no repo path'
  return null
}

/**
 * Every job that runs on a timer, with its interval (or cron expression) and its next and last
 * time; with a range, the times each cron schedule runs in it.
 */
export const listCronJobs = async (
  db: Db,
  status: LoopStatus,
  range: Range | null = null,
): Promise<CronJob[]> => {
  const settings = await getSettings(db)
  const live = (await db.select().from(projects).orderBy(asc(projects.id))).filter(
    (p) => !p.archived,
  )
  const byId = new Map(live.map((p) => [p.id, p]))
  const offOf = (p: ProjectRow) => projectOff(p, settings.paused, status !== null)
  const scheduleJobs = (await db.select().from(schedules).orderBy(asc(schedules.id))).flatMap(
    (s) => {
      const p = byId.get(s.project_id)
      if (!p) return []
      const off = s.enabled ? schedulesOff(p, settings.paused, status !== null) : 'schedule off'
      return [scheduleJob(s, p, off, range)]
    },
  )
  return [...live.map((p) => workerJob(p, offOf(p))), ...scheduleJobs, housekeepingJob(status)]
}

/** The runs that started between two instants (from included, to excluded), oldest first. */
export const runsBetween = (db: Db, from: Date, to: Date) =>
  db
    .select({
      id: runs.id,
      card_id: runs.card_id,
      card_title: cards.title,
      schedule_name: schedules.name,
      project_id: runs.project_id,
      status: runs.status,
      started_at: runs.started_at,
      ended_at: runs.ended_at,
    })
    .from(runs)
    .leftJoin(cards, eq(cards.id, runs.card_id))
    .leftJoin(schedules, eq(schedules.id, runs.schedule_id))
    .where(and(gte(runs.started_at, from), lt(runs.started_at, to)))
    .orderBy(asc(runs.started_at))
    .limit(1000)

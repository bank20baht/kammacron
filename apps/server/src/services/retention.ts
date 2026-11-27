import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { and, count, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'

import type { Executor } from '../db'
import { purgeOrphans } from './attachments'
import { purgeOAuth } from './oauth-storage'
import {
  alerts,
  attachments,
  cardWaitsOn,
  cards,
  comments,
  projects,
  runEvents,
  runSteps,
  runs,
  schedules,
  settings,
} from '../db/schema'

/**
 * What kammacron keeps, for how long, and the housekeeping that lets go of the rest: run logs
 * (events and raw files), step output, runs, done cards (archived), archived cards (removed), read
 * alerts. A null length keeps that kind until a person removes it. Projects, cron jobs, playbooks
 * and settings are never removed here: only a person does that (`removeProject`, `removeSchedule`,
 * not offered to agents).
 */

export const RETENTION_KEYS = [
  'run_log_retention_days',
  'step_output_retention_days',
  'run_retention_days',
  'done_card_archive_days',
  'archived_card_retention_days',
  'alert_retention_days',
] as const
export type RetentionKey = (typeof RETENTION_KEYS)[number]
export type Retention = Record<RetentionKey, number | null>

/** Each kind of data: how many there are, how many the lengths let go now, and their bytes. */
export type DataKind = { key: RetentionKey; total: number; due: number; bytes: number | null }

const before = (days: number) => sql`now() - make_interval(days => ${days})`
const older = (column: Parameters<typeof lt>[0], days: number) => lt(column, before(days))

/** Where runs keep their raw stream (`logs/runs/<run id>.jsonl`), whatever started them. */
export const runLogDir = (dataDir: string) => join(dataDir, 'logs', 'runs')

type LogFile = { path: string; runId: number | null; bytes: number; mtime: number }

const logFiles = async (dataDir: string): Promise<LogFile[]> => {
  const dir = runLogDir(dataDir)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const files: LogFile[] = []
  for (const name of names.filter((n) => n.endsWith('.jsonl'))) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) continue
    const id = Number(name.slice(0, -'.jsonl'.length))
    files.push({
      path,
      runId: Number.isInteger(id) ? id : null,
      bytes: info.size,
      mtime: info.mtimeMs,
    })
  }
  return files
}

const dueFile = (f: LogFile, days: number | null) =>
  days !== null && f.mtime < Date.now() - days * 86_400_000

/** The lengths in force. */
export const retentionOf = async (db: Executor): Promise<Retention> => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  return Object.fromEntries(RETENTION_KEYS.map((k) => [k, row?.[k] ?? null])) as Retention
}

const n = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0

/** Done cards the archive length has passed. */
const doneDue = (days: number) =>
  and(
    eq(cards.status, 'done'),
    eq(cards.archived, false),
    isNotNull(cards.done_at),
    older(cards.done_at, days),
  )
/** Archived cards the removal length has passed. */
const archivedDue = (days: number) =>
  and(eq(cards.archived, true), isNotNull(cards.archived_at), older(cards.archived_at, days))
/** Finished runs the run length has passed; a running one is never let go. */
const runDue = (days: number) =>
  and(isNotNull(runs.ended_at), sql`${runs.status} <> 'running'`, older(runs.started_at, days))

/** How much of each kind there is, and how much `r` (the lengths in force by default) lets go now. */
export const dataSummary = async (
  db: Executor,
  dataDir: string,
  r: Retention,
): Promise<DataKind[]> => {
  const files = await logFiles(dataDir)
  const never = sql`false`
  const kinds: DataKind[] = [
    {
      key: 'run_log_retention_days',
      total: await n(db.select({ n: count() }).from(runEvents)),
      due:
        r.run_log_retention_days === null
          ? 0
          : await n(
              db
                .select({ n: count() })
                .from(runEvents)
                .where(older(runEvents.created_at, r.run_log_retention_days)),
            ),
      bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    },
    {
      key: 'step_output_retention_days',
      total: await n(db.select({ n: count() }).from(runSteps).where(isNotNull(runSteps.output))),
      due: await n(
        db
          .select({ n: count() })
          .from(runSteps)
          .where(
            r.step_output_retention_days === null
              ? never
              : and(
                  isNotNull(runSteps.output),
                  older(runSteps.created_at, r.step_output_retention_days),
                ),
          ),
      ),
      bytes: null,
    },
    {
      key: 'run_retention_days',
      total: await n(db.select({ n: count() }).from(runs)),
      due: await n(
        db
          .select({ n: count() })
          .from(runs)
          .where(r.run_retention_days === null ? never : runDue(r.run_retention_days)),
      ),
      bytes: null,
    },
    {
      key: 'done_card_archive_days',
      total: await n(
        db
          .select({ n: count() })
          .from(cards)
          .where(and(eq(cards.status, 'done'), eq(cards.archived, false))),
      ),
      due: await n(
        db
          .select({ n: count() })
          .from(cards)
          .where(r.done_card_archive_days === null ? never : doneDue(r.done_card_archive_days)),
      ),
      bytes: null,
    },
    {
      key: 'archived_card_retention_days',
      total: await n(db.select({ n: count() }).from(cards).where(eq(cards.archived, true))),
      due: await n(
        db
          .select({ n: count() })
          .from(cards)
          .where(
            r.archived_card_retention_days === null
              ? never
              : archivedDue(r.archived_card_retention_days),
          ),
      ),
      bytes: null,
    },
    {
      key: 'alert_retention_days',
      total: await n(db.select({ n: count() }).from(alerts).where(eq(alerts.read, true))),
      due: await n(
        db
          .select({ n: count() })
          .from(alerts)
          .where(
            r.alert_retention_days === null
              ? never
              : and(eq(alerts.read, true), older(alerts.created_at, r.alert_retention_days)),
          ),
      ),
      bytes: null,
    },
  ]
  return kinds
}

/** Removes runs, their events and steps and log files; what pointed at them stops pointing. */
const removeRuns = async (db: Executor, dataDir: string, ids: number[]) => {
  if (!ids.length) return 0
  await db.update(alerts).set({ run_id: null }).where(inArray(alerts.run_id, ids))
  await db.update(cards).set({ claimed_by_run: null }).where(inArray(cards.claimed_by_run, ids))
  await db.update(schedules).set({ last_run_id: null }).where(inArray(schedules.last_run_id, ids))
  await db.delete(runEvents).where(inArray(runEvents.run_id, ids))
  await db.delete(runSteps).where(inArray(runSteps.run_id, ids))
  await db.delete(runs).where(inArray(runs.id, ids))
  for (const id of ids)
    await rm(join(runLogDir(dataDir), `${String(id)}.jsonl`), { force: true }).catch(
      () => undefined,
    )
  return ids.length
}

/**
 * Removes cards with their comments, attachments (their files go with the orphan sweep) and waits; the runs that worked them stay (Stats counts them), no longer pointing at a card.
 */
const removeCards = async (db: Executor, ids: number[]) => {
  if (!ids.length) return 0
  await db.update(runs).set({ card_id: null }).where(inArray(runs.card_id, ids))
  await db.update(alerts).set({ card_id: null }).where(inArray(alerts.card_id, ids))
  await db.update(schedules).set({ last_card_id: null }).where(inArray(schedules.last_card_id, ids))
  await db
    .delete(cardWaitsOn)
    .where(or(inArray(cardWaitsOn.card_id, ids), inArray(cardWaitsOn.waits_on_id, ids)))
  await db.delete(comments).where(inArray(comments.card_id, ids))
  // unlinked, they are orphans: the sweep after removes them and their files
  await db.update(attachments).set({ card_id: null }).where(inArray(attachments.card_id, ids))
  await db.delete(cards).where(inArray(cards.id, ids))
  return ids.length
}

export type Housekept = Record<RetentionKey, number>

/** Lets go of what the lengths have passed; says how many of each went. */
const housekeep = async (db: Executor, dataDir: string, r: Retention): Promise<Housekept> => {
  const done: Housekept = {
    run_log_retention_days: 0,
    step_output_retention_days: 0,
    run_retention_days: 0,
    done_card_archive_days: 0,
    archived_card_retention_days: 0,
    alert_retention_days: 0,
  }
  if (r.done_card_archive_days !== null) {
    const archived = await db
      .update(cards)
      .set({ archived: true, archived_at: new Date() })
      .where(doneDue(r.done_card_archive_days))
      .returning({ id: cards.id })
    done.done_card_archive_days = archived.length
  }
  if (r.archived_card_retention_days !== null) {
    const ids = await db
      .select({ id: cards.id })
      .from(cards)
      .where(archivedDue(r.archived_card_retention_days))
    done.archived_card_retention_days = await removeCards(
      db,
      ids.map((c) => c.id),
    )
  }
  if (r.run_retention_days !== null) {
    const ids = await db.select({ id: runs.id }).from(runs).where(runDue(r.run_retention_days))
    done.run_retention_days = await removeRuns(
      db,
      dataDir,
      ids.map((x) => x.id),
    )
  }
  if (r.step_output_retention_days !== null) {
    const cleared = await db
      .update(runSteps)
      .set({ output: null })
      .where(
        and(isNotNull(runSteps.output), older(runSteps.created_at, r.step_output_retention_days)),
      )
      .returning({ id: runSteps.id })
    done.step_output_retention_days = cleared.length
  }
  if (r.run_log_retention_days !== null) {
    const days = r.run_log_retention_days
    const events = await db
      .delete(runEvents)
      .where(older(runEvents.created_at, days))
      .returning({ id: runEvents.id })
    const stale = (await logFiles(dataDir)).filter((f) => dueFile(f, days))
    for (const f of stale) await rm(f.path, { force: true })
    const ids = stale.flatMap((f) => (f.runId === null ? [] : [f.runId]))
    if (ids.length) await db.update(runs).set({ log_path: null }).where(inArray(runs.id, ids))
    done.run_log_retention_days = events.length
  }
  if (r.alert_retention_days !== null) {
    const gone = await db
      .delete(alerts)
      .where(and(eq(alerts.read, true), older(alerts.created_at, r.alert_retention_days)))
      .returning({ id: alerts.id })
    done.alert_retention_days = gone.length
  }
  return done
}

/** A cron job, removed by a person: its runs stay, no longer pointing at it. */
export const removeSchedule = async (db: Executor, id: number) =>
  db.transaction(async (tx) => {
    await tx.update(runs).set({ schedule_id: null }).where(eq(runs.schedule_id, id))
    const [gone] = await tx.delete(schedules).where(eq(schedules.id, id)).returning()
    return gone ?? null
  })

/** A project, removed by a person: its cards, runs, cron jobs, alerts and log files with it. */
export const removeProject = async (db: Executor, dataDir: string, id: number) =>
  db.transaction(async (tx) => {
    const cardIds = (
      await tx.select({ id: cards.id }).from(cards).where(eq(cards.project_id, id))
    ).map((c) => c.id)
    const runIds = (await tx.select({ id: runs.id }).from(runs).where(eq(runs.project_id, id))).map(
      (x) => x.id,
    )
    await removeRuns(tx, dataDir, runIds)
    await tx.update(schedules).set({ last_card_id: null }).where(eq(schedules.project_id, id))
    await removeCards(tx, cardIds)
    await tx.delete(schedules).where(eq(schedules.project_id, id))
    await tx.delete(alerts).where(eq(alerts.project_id, id))
    const [gone] = await tx.delete(projects).where(eq(projects.id, id)).returning()
    return gone ?? null
  })

/** The daily housekeeping, and Clean now: the lengths in force, then orphan files and OAuth rows. */
export const cleanUp = async (db: Executor, dataDir: string) => {
  const done = await housekeep(db, dataDir, await retentionOf(db))
  await purgeOrphans(db, join(dataDir, 'files'))
  await purgeOAuth(db)
  return done
}

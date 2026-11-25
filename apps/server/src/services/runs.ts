import { and, asc, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import { cards, runEvents, runs, type RunEventType, type RunStatus } from '../db/schema'
import { notFound } from './errors'

export type Run = typeof runs.$inferSelect

export type RunQuery = {
  project_id?: number | undefined
  card_id?: number | undefined
  status?: RunStatus | undefined
  limit?: number | undefined
  /** Runs older than this id (keyset paging, newest first). */
  before?: number | undefined
}

export const listRuns = (db: Executor, query: RunQuery = {}) => {
  const where: SQL[] = []
  if (query.project_id !== undefined) where.push(eq(runs.project_id, query.project_id))
  if (query.card_id !== undefined) where.push(eq(runs.card_id, query.card_id))
  if (query.status !== undefined) where.push(eq(runs.status, query.status))
  if (query.before !== undefined) where.push(lt(runs.id, query.before))
  return db
    .select({ run: runs, card_title: cards.title })
    .from(runs)
    .innerJoin(cards, eq(cards.id, runs.card_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(runs.id))
    .limit(Math.min(query.limit ?? 50, 200))
    .then((rows) => rows.map((r) => ({ ...r.run, card_title: r.card_title })))
}

export const getRun = async (db: Executor, id: number) => {
  const [row] = await db.select().from(runs).where(eq(runs.id, id))
  if (!row) throw notFound('run', id)
  return row
}

/** A run with its events (after `after`, for a page that already holds the earlier ones). */
export const getRunWithEvents = async (db: Executor, id: number, after = 0, limit = 500) => {
  const run = await getRun(db, id)
  const events = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.run_id, id), gt(runEvents.seq, after)))
    .orderBy(asc(runEvents.seq))
    .limit(limit)
  return { ...run, events }
}

export const createRun = async (
  db: Executor,
  input: { project_id: number; card_id: number; base_sha: string | null; log_path: string | null },
) =>
  firstRow(
    await db
      .insert(runs)
      .values({ ...input, status: 'running' })
      .returning(),
  )

export const updateRun = async (
  db: Executor,
  id: number,
  patch: Partial<Omit<Run, 'id' | 'created_at' | 'updated_at'>>,
) => firstRow(await db.update(runs).set(patch).where(eq(runs.id, id)).returning())

export const addRunEvent = (
  db: Executor,
  runId: number,
  seq: number,
  event: { type: RunEventType; summary: string; data: unknown },
) =>
  db
    .insert(runEvents)
    .values({ run_id: runId, seq, type: event.type, summary: event.summary, data: event.data })

/** Earlier runs of a card, newest first, for the prompt of the next. */
export const previousRuns = (db: Executor, cardId: number, limit = 5) =>
  db.select().from(runs).where(eq(runs.card_id, cardId)).orderBy(desc(runs.id)).limit(limit)

/** On boot: a run still `running` died with the process. Returns their cards. */
export const markInterruptedRuns = async (db: Executor) => {
  const gone = await db
    .update(runs)
    .set({
      status: 'stale',
      ended_at: new Date(),
      error: 'the server stopped while this run was going',
      error_kind: 'crash',
    })
    .where(inArray(runs.status, ['running', 'verifying']))
    .returning({ id: runs.id, card_id: runs.card_id })
  return gone
}

/** Keeps `days` of run events (the summary row stays). */
export const pruneRunEvents = (db: Executor, days: number) =>
  db.delete(runEvents).where(lt(runEvents.created_at, sql`now() - make_interval(days => ${days})`))

import { and, asc, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import {
  cards,
  runEvents,
  runSteps,
  runs,
  type RunEventType,
  type RunStatus,
  type StepStatus,
} from '../db/schema'
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

const getRun = async (db: Executor, id: number) => {
  const [row] = await db.select().from(runs).where(eq(runs.id, id))
  if (!row) throw notFound('run', id)
  return row
}

/** A run with its steps and events (after `after`, for a page that already holds the earlier ones). */
export const getRunWithEvents = async (db: Executor, id: number, after = 0, limit = 500) => {
  const run = await getRun(db, id)
  const events = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.run_id, id), gt(runEvents.seq, after)))
    .orderBy(asc(runEvents.seq))
    .limit(limit)
  return { ...run, steps: await runStepsOf(db, id), events }
}

const runStepsOf = (db: Executor, runId: number) =>
  db.select().from(runSteps).where(eq(runSteps.run_id, runId)).orderBy(asc(runSteps.position))

export const startStep = async (
  db: Executor,
  input: {
    run_id: number
    position: number
    kind: 'claude' | 'run'
    name: string
    command: string | null
  },
) =>
  firstRow(
    await db
      .insert(runSteps)
      .values({ ...input, status: 'running', started_at: new Date() })
      .returning(),
  )

export const endStep = async (
  db: Executor,
  id: number,
  patch: { status: StepStatus; exit_code?: number | null; output?: string | null },
) =>
  firstRow(
    await db
      .update(runSteps)
      .set({ ...patch, ended_at: new Date() })
      .where(eq(runSteps.id, id))
      .returning(),
  )

/** Steps after the one that stopped the run: written down as skipped, so the page shows them. */
export const skipSteps = (
  db: Executor,
  runId: number,
  steps: readonly {
    position: number
    kind: 'claude' | 'run'
    name: string
    command: string | null
  }[],
) =>
  steps.length === 0
    ? Promise.resolve()
    : db
        .insert(runSteps)
        .values(steps.map((s) => ({ ...s, run_id: runId, status: 'skipped' as const })))
        .then(() => undefined)

export const createRun = async (
  db: Executor,
  input: { project_id: number; card_id: number; log_path: string | null },
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
    .where(eq(runs.status, 'running'))
    .returning({ id: runs.id, card_id: runs.card_id })
  await stopRunningSteps(
    db,
    gone.map((g) => g.id),
  )
  return gone
}

/** Every running step of these runs ends as stopped (the server went away under them). */
const stopRunningSteps = (db: Executor, runIds: readonly number[]) =>
  runIds.length === 0
    ? Promise.resolve()
    : db
        .update(runSteps)
        .set({ status: 'stopped', ended_at: new Date() })
        .where(and(inArray(runSteps.run_id, [...runIds]), eq(runSteps.status, 'running')))
        .then(() => undefined)

/** Keeps `days` of run events (the summary row stays). */
export const pruneRunEvents = (db: Executor, days: number) =>
  db.delete(runEvents).where(lt(runEvents.created_at, sql`now() - make_interval(days => ${days})`))

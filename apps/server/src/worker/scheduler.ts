import { join } from 'node:path'

import { and, eq, isNull, lte, or } from 'drizzle-orm'

import { cards, projects, runs, schedules } from '../db/schema'
import { addAlert } from '../services/alerts'
import { HOUSEKEEPING_MINUTES } from '../services/calendar'
import { purgeOrphans } from '../services/attachments'
import { purgeOAuth } from '../services/oauth-storage'
import { addComment, createCards, moveCard, pickableCards } from '../services/cards'
import { getProject, type Project } from '../services/projects'
import { markInterruptedRuns, pruneRunEvents } from '../services/runs'
import { getSettings } from '../services/settings'
import { childEnv, type WorkerEnv } from './env'
import { exec } from './git'
import { runCard } from './runner'

const TICK_MS = 30_000

export type SchedulerStatus = {
  running: { run_id: number; project_id: number; card_id: number }[]
  queued: number[]
  last_tick: string | null
  /** When the daily housekeeping (old run events, orphan files, OAuth rows) last ran. */
  housekeeping_at: string | null
}

/**
 * The loop of one process: every 30 s it looks for projects whose `next_run_at` has come, and
 * runs their round in a queue (one project at a time each, `settings.concurrency` at most).
 */
export const createScheduler = (env: WorkerEnv) => {
  const queue: number[] = []
  const active = new Map<number, Promise<void>>()
  let timer: ReturnType<typeof setInterval> | undefined
  let lastTick: Date | null = null
  let ticking = false

  /** Cards in `doing` whose run is gone: back to todo, and to review the second time. */
  const sweepStale = async (projectId: number) => {
    const settings = await getSettings(env.db)
    const cutoff = new Date(Date.now() - settings.stale_minutes * 60_000)
    const doing = await env.db
      .select()
      .from(cards)
      .where(and(eq(cards.project_id, projectId), eq(cards.status, 'doing')))
    const live = new Set([...env.handles.keys()])
    for (const card of doing) {
      const runId = card.claimed_by_run
      if (runId !== null && live.has(runId)) continue
      // a card a person moved to doing (no run) is theirs, unless it sat there past the stale time
      if (runId === null && card.updated_at > cutoff) continue
      const staleCount = card.stale_count + 1
      await env.db.update(cards).set({ stale_count: staleCount }).where(eq(cards.id, card.id))
      if (runId !== null)
        await env.db
          .update(runs)
          .set({ status: 'stale', ended_at: new Date() })
          .where(and(eq(runs.id, runId), eq(runs.status, 'running')))
      if (staleCount >= 2)
        await moveCard(env.db, card.id, {
          status: 'review',
          reason: 'stuck in doing twice; a person should look',
        })
      else await moveCard(env.db, card.id, { status: 'todo' })
    }
  }

  const runnable = (project: Project) =>
    !project.paused_reason &&
    project.worker_enabled &&
    !project.archived &&
    project.repo_path !== null

  const nextRunAt = (project: Project) => new Date(Date.now() + project.interval_minutes * 60_000)

  /**
   * Up to max cards, one at a time: how many ran, and why the round stopped short of a card it
   * had (the directory is gone); null when it must end without rescheduling.
   */
  const runCards = async (project: Project) => {
    let done = 0
    for (; done < project.max_cards_per_run; done++) {
      if ((await getSettings(env.db)).paused) break
      const fresh = await getProject(env.db, project.id)
      if (!runnable(fresh)) break
      const [card] = await pickableCards(env.db, project.id, 1)
      if (!card) break
      const outcome = await runCard(env, fresh, card.id)
      const kind = outcome.errorKind
      if (kind === 'auth' || kind === 'rate_limit') return null
      if (outcome.skipped && outcome.skipped !== 'claimed by someone else')
        return { done, skipped: outcome.skipped }
    }
    return { done, skipped: null }
  }

  /** What the round says of itself on the board and in the calendar. */
  const checkResult = (done: number, skipped: string | null) => {
    const ran = done === 0 ? 'no cards' : `ran ${String(done)} card${done === 1 ? '' : 's'}`
    if (!skipped) return ran
    return done === 0 ? `skipped: ${skipped}` : `${ran}, then skipped: ${skipped}`
  }

  /** One round of a project: stale sweep, pre-check without Claude, then up to max cards. */
  const round = async (projectId: number) => {
    const settings = await getSettings(env.db)
    const project = await getProject(env.db, projectId)
    if (settings.paused || !runnable(project)) return
    await sweepStale(project.id)
    await runSchedules(project)
    const outcome = await runCards(project)
    if (outcome === null) return
    const result = checkResult(outcome.done, outcome.skipped)
    // said once, not every round it stays so
    if (outcome.skipped && result !== project.last_check_result)
      await addAlert(env.db, {
        level: 'warning',
        project_id: project.id,
        message: `${project.name}: round skipped: ${outcome.skipped}`,
      })
    await env.db
      .update(projects)
      .set({
        last_checked_at: new Date(),
        last_check_result: result,
        next_run_at: nextRunAt(project),
      })
      .where(eq(projects.id, project.id))
  }

  /** Schedules of a project that are due: a failing command opens (or comments on) a card. */
  const runSchedules = async (project: Project) => {
    const due = await env.db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.project_id, project.id),
          eq(schedules.enabled, true),
          or(isNull(schedules.next_run_at), lte(schedules.next_run_at, new Date())),
        ),
      )
    if (due.length === 0 || !project.repo_path) return
    const childEnvironment = await childEnv(env)
    // in the directory as it is: kammacron never resets or switches it
    for (const schedule of due) {
      const r = await exec(['sh', '-c', schedule.command], {
        cwd: project.repo_path,
        env: childEnvironment,
        timeoutMs: 30 * 60_000,
      })
      const output = `${r.stdout}\n${r.stderr}`.trim().slice(-3000)
      let cardId = schedule.last_card_id
      if (r.code !== 0) {
        const [open] =
          cardId === null ? [] : await env.db.select().from(cards).where(eq(cards.id, cardId))
        const body = `\`${schedule.command}\` failed with exit ${String(r.code)}.\n\n\`\`\`\n${output}\n\`\`\``
        if (open && open.status !== 'done' && !open.archived)
          await addComment(env.db, open.id, {
            author: 'claude-worker',
            body: `Still failing (${new Date().toISOString().slice(0, 16)}).\n\n${body}`,
          })
        else {
          const [created] = await createCards(env.db, [
            {
              project_id: project.id,
              title: `${schedule.name} fails`,
              body: `Autonomy: claude - opened by the schedule "${schedule.name}"; make it pass again.\n\n${body}`,
              tags: schedule.card_tags,
            },
          ])
          cardId = created?.id ?? null
        }
      }
      await env.db
        .update(schedules)
        .set({
          last_run_at: new Date(),
          last_exit_code: r.code,
          last_card_id: cardId,
          next_run_at: new Date(Date.now() + schedule.interval_minutes * 60_000),
        })
        .where(eq(schedules.id, schedule.id))
    }
  }

  const pump = () => {
    void (async () => {
      const settings = await getSettings(env.db)
      while (queue.length > 0 && active.size < Math.max(1, settings.concurrency)) {
        const index = queue.findIndex((id) => !active.has(id))
        if (index < 0) return
        const [projectId] = queue.splice(index, 1)
        if (projectId === undefined) return
        const job = round(projectId)
          .catch(async (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            await addAlert(env.db, {
              level: 'error',
              project_id: projectId,
              message: `round failed: ${message.slice(0, 500)}`,
            }).catch(() => undefined)
          })
          .finally(() => {
            active.delete(projectId)
            pump()
          })
        active.set(projectId, job)
      }
    })()
  }

  const enqueue = (projectId: number) => {
    if (!queue.includes(projectId) && !active.has(projectId)) queue.push(projectId)
    pump()
  }

  const tick = async () => {
    if (ticking) return
    ticking = true
    try {
      lastTick = new Date()
      const settings = await getSettings(env.db)
      if (settings.paused) return
      const due = await env.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.worker_enabled, true),
            eq(projects.archived, false),
            isNull(projects.paused_reason),
            or(isNull(projects.next_run_at), lte(projects.next_run_at, new Date())),
          ),
        )
      for (const p of due) enqueue(p.id)
    } finally {
      ticking = false
    }
  }

  /** Once a day: old run events and orphan files go. */
  let housekept: Date | null = null
  const housekeeping = async () => {
    housekept = new Date()
    const settings = await getSettings(env.db)
    await pruneRunEvents(env.db, settings.run_log_retention_days)
    await purgeOrphans(env.db, join(env.dataDir, 'files'))
    await purgeOAuth(env.db)
  }
  let housekeepingTimer: ReturnType<typeof setInterval> | undefined

  return {
    /** On boot: runs that died with the last process go stale and their cards back to todo. */
    start: async () => {
      for (const gone of await markInterruptedRuns(env.db)) {
        const [card] = await env.db.select().from(cards).where(eq(cards.id, gone.card_id))
        if (card?.status === 'doing' && card.claimed_by_run === gone.id)
          await moveCard(env.db, card.id, { status: 'todo' })
      }
      timer = setInterval(() => void tick(), TICK_MS)
      housekeepingTimer = setInterval(
        () => void housekeeping().catch(() => undefined),
        HOUSEKEEPING_MINUTES * 60_000,
      )
      void tick()
      void housekeeping().catch(() => undefined)
    },
    stop: async () => {
      if (timer) clearInterval(timer)
      if (housekeepingTimer) clearInterval(housekeepingTimer)
      queue.length = 0
      for (const handle of env.handles.values()) handle.stop()
      await Promise.allSettled([...active.values()])
    },
    /** "Run now": a round for this project whatever its next_run_at says (still not when paused). */
    runNow: (projectId: number) => {
      enqueue(projectId)
    },
    /** Stop: SIGTERM, then SIGKILL after 10 s; the card goes back to todo. */
    stopRun: (runId: number) => {
      const handle = env.handles.get(runId)
      if (!handle) return false
      handle.stoppedByUser = true
      handle.stop()
      return true
    },
    tick,
    /** Resolves when every round in flight (and queued) has ended. For tests. */
    idle: async () => {
      while (active.size > 0 || queue.length > 0)
        await Promise.allSettled([...active.values(), Bun.sleep(20)])
    },
    status: async (): Promise<SchedulerStatus> => {
      const running = await env.db
        .select({ run_id: runs.id, project_id: runs.project_id, card_id: runs.card_id })
        .from(runs)
        .where(eq(runs.status, 'running'))
      return {
        running,
        queued: [...queue],
        last_tick: lastTick?.toISOString() ?? null,
        housekeeping_at: housekept?.toISOString() ?? null,
      }
    },
  }
}

export type Scheduler = ReturnType<typeof createScheduler>

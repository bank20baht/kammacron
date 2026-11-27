import { and, eq, isNotNull, isNull, lte, or } from 'drizzle-orm'

import { cards, PLAYBOOK_TAG, projects, runs, schedules } from '../db/schema'

type Schedule = typeof schedules.$inferSelect
import { addAlert } from '../services/alerts'
import { HOUSEKEEPING_MINUTES } from '../services/calendar'
import { nextScheduleRun } from '../services/cron'
import { addComment, createCards, moveCard, pickableCards } from '../services/cards'
import { getProject, type Project } from '../services/projects'
import { markInterruptedRuns } from '../services/runs'
import { cleanUp } from '../services/retention'
import { getSettings } from '../services/settings'
import { redact } from './redact'
import { childEnv, claudeHeld, passedSecrets, type WorkerEnv } from './env'
import { exec } from './git'
import { runAgentSchedule } from './agent'
import { needsClaude, runCard } from './runner'

const TICK_MS = 30_000

export type SchedulerStatus = {
  running: { run_id: number; project_id: number; card_id: number | null }[]
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
  /** Shutting down: nothing new starts. */
  let stopping = false

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

  /** The next card to run; while Claude is held, the next one that does without it. */
  const nextCard = async (project: Project) => {
    const held = claudeHeld(env)
    const pickable = await pickableCards(env.db, project.id, held ? 10_000 : 1)
    const card = held ? pickable.find((c) => !needsClaude(project, c)) : pickable[0]
    return { card, waiting: card === undefined && pickable.length > 0 ? held : null }
  }

  /**
   * Up to max cards, one at a time: how many ran, why the round stopped short of a card it had
   * (the directory is gone), and why cards were left waiting.
   */
  const runCards = async (project: Project) => {
    let done = 0
    for (; done < project.max_cards_per_run; done++) {
      if (stopping || (await getSettings(env.db)).paused) break
      const fresh = await getProject(env.db, project.id)
      if (!runnable(fresh)) break
      const { card, waiting } = await nextCard(fresh)
      if (!card) return { done, skipped: null, waiting }
      const outcome = await runCard(env, fresh, card.id)
      // Stop put the card back in todo: going on would pick it up again at once
      if (outcome.errorKind === 'stopped') return { done: done + 1, skipped: null, waiting: null }
      if (outcome.skipped && outcome.skipped !== 'claimed by someone else')
        return { done, skipped: outcome.skipped, waiting: null }
    }
    return { done, skipped: null, waiting: null }
  }

  /** What the round says of itself on the board and in the calendar. */
  const checkResult = (done: number, skipped: string | null, waiting: string | null) => {
    const ran = done === 0 ? 'no cards' : `ran ${String(done)} card${done === 1 ? '' : 's'}`
    if (waiting) return `${ran}; cards wait: ${waiting}`
    if (!skipped) return ran
    return done === 0 ? `skipped: ${skipped}` : `${ran}, then skipped: ${skipped}`
  }

  /**
   * Schedules run on their own time, whether the project's worker is on or not: they need only a
   * directory, and the project neither archived nor paused.
   */
  const schedulable = (project: Project) =>
    !project.paused_reason && !project.archived && project.repo_path !== null

  /** Only the schedules that are due; and the cards a playbook schedule just opened. */
  const scheduleRound = async (projectId: number) => {
    const settings = await getSettings(env.db)
    const project = await getProject(env.db, projectId)
    if (settings.paused || !schedulable(project)) return
    const opened = await runSchedules(project)
    if (opened && runnable(project)) await runCards(project)
  }

  /** One round of a project: stale sweep, its due schedules, then up to max cards. */
  const round = async (projectId: number) => {
    const settings = await getSettings(env.db)
    const project = await getProject(env.db, projectId)
    if (settings.paused || !runnable(project)) return
    await sweepStale(project.id)
    await runSchedules(project)
    const outcome = await runCards(project)
    const result = checkResult(outcome.done, outcome.skipped, outcome.waiting)
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

  /**
   * Schedules of a project that are due: a failing command opens (or comments on) a card, a
   * playbook opens a card, an agent runs. Whether a playbook opened a card the round should run.
   */
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
    let opened = false
    if (due.length === 0 || !project.repo_path) return opened
    for (const schedule of due) {
      if (stopping) return opened
      const started = new Date()
      // the next time first: a run that takes long does not make the next tick start it again
      await env.db
        .update(schedules)
        .set({ last_run_at: started, next_run_at: nextScheduleRun(schedule, started) })
        .where(eq(schedules.id, schedule.id))
      const done = await runSchedule(project, schedule, project.repo_path)
      if (schedule.playbook && done.last_card_id !== null) opened = true
      await env.db.update(schedules).set(done).where(eq(schedules.id, schedule.id))
    }
    return opened
  }

  /** One schedule's time, by what it runs; what to write on its row after. */
  const runSchedule = async (project: Project, schedule: Schedule, dir: string) => {
    if (schedule.agent) {
      const outcome = await runAgentSchedule(env, project, schedule)
      return {
        last_card_id: schedule.last_card_id,
        last_run_id: outcome.run?.id ?? schedule.last_run_id,
        last_result: outcome.result,
      }
    }
    if (schedule.playbook) {
      const cardId = await playbookCard(project, schedule)
      return {
        last_card_id: cardId,
        last_result: cardId === null ? 'no card' : `card #${String(cardId)}`,
      }
    }
    const cardId = await commandSchedule(project, schedule, dir)
    return { last_card_id: cardId }
  }

  /** The card a schedule opened last, while it is still open. */
  const openCard = async (cardId: number | null) => {
    if (cardId === null) return null
    const [card] = await env.db.select().from(cards).where(eq(cards.id, cardId))
    return card && card.status !== 'done' && !card.archived ? card : null
  }

  /**
   * A playbook on a timer: a card tagged `playbook:<name>`, which this same round runs (schedules
   * go before cards). While the last one is still open, no second one.
   */
  const playbookCard = async (project: Project, schedule: Schedule) => {
    const open = await openCard(schedule.last_card_id)
    if (open) return open.id
    const [created] = await createCards(env.db, [
      {
        project_id: project.id,
        // local time, as the app shows it ('sv-SE' writes 2026-11-25 23:51)
        title: `${schedule.name} (${new Date().toLocaleString('sv-SE').slice(0, 16)})`,
        body: `Opened by the schedule "${schedule.name}": run the playbook "${schedule.playbook ?? ''}".`,
        tags: [`${PLAYBOOK_TAG}${schedule.playbook ?? ''}`],
        priority: 1,
      },
    ])
    return created?.id ?? null
  }

  /** A command on a timer, in the directory as it is: a failure opens (or comments on) a card. */
  const commandSchedule = async (project: Project, schedule: Schedule, dir: string) => {
    const r = await exec(['sh', '-c', schedule.command ?? 'true'], {
      cwd: dir,
      env: await childEnv(env),
      timeoutMs: 30 * 60_000,
      // the card shows the last 3000 characters; a chatty command need not fill memory
      tail: 8000,
    })
    await env.db
      .update(schedules)
      .set({ last_exit_code: r.code, last_result: `exit ${String(r.code)}` })
      .where(eq(schedules.id, schedule.id))
    if (r.code === 0) return schedule.last_card_id
    const secrets = [env.apiToken(), ...passedSecrets()]
    const output = redact(`${r.stdout}\n${r.stderr}`, secrets).trim().slice(-3000)
    const failed = `\`${schedule.command ?? ''}\` failed with exit ${String(r.code)}.`
    // Output is whatever a test, a package or a remote host printed. It goes in a comment, which
    // the worker reads as data, never in the body, which it reads as the task.
    const printed = output || '(no output)' // comments are plain text: no fences
    const open = await openCard(schedule.last_card_id)
    if (open) {
      await addComment(env.db, open.id, {
        author: 'claude-worker',
        body: `Still failing (${new Date().toISOString().slice(0, 16)}). ${failed}\n\n${printed}`,
      })
      return open.id
    }
    const [created] = await createCards(env.db, [
      {
        project_id: project.id,
        title: `${schedule.name} fails`,
        body: `Opened by the schedule "${schedule.name}": make it pass again.\n\n${failed} What it printed is in the comments.`,
        tags: schedule.card_tags,
      },
    ])
    if (created) {
      await addComment(env.db, created.id, { author: 'claude-worker', body: printed })
      // once, when it starts failing; and without the output, which may hold anything
      await env.notify(
        `${schedule.name} fails`,
        `${project.name}: card #${String(created.id)}, exit ${String(r.code)}`,
      )
    }
    return created?.id ?? null
  }

  const pump = () => {
    void (async () => {
      const settings = await getSettings(env.db)
      while (!stopping && queue.length > 0 && active.size < Math.max(1, settings.concurrency)) {
        const index = queue.findIndex((id) => !active.has(id))
        if (index < 0) return
        const [projectId] = queue.splice(index, 1)
        if (projectId === undefined) return
        const full = fullRound.delete(projectId)
        const job = (full ? round(projectId) : scheduleRound(projectId))
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

  /** Projects queued for a whole round; the others in the queue run only their due schedules. */
  const fullRound = new Set<number>()

  const enqueue = (projectId: number, full = true) => {
    if (active.has(projectId)) return
    if (full) fullRound.add(projectId)
    if (!queue.includes(projectId)) queue.push(projectId)
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
      // schedules come on their own time, not only with their project's round
      const dueSchedules = await env.db
        .selectDistinct({ id: schedules.project_id })
        .from(schedules)
        .innerJoin(projects, eq(projects.id, schedules.project_id))
        .where(
          and(
            eq(schedules.enabled, true),
            eq(projects.archived, false),
            isNull(projects.paused_reason),
            isNotNull(projects.repo_path),
            or(isNull(schedules.next_run_at), lte(schedules.next_run_at, new Date())),
          ),
        )
      for (const p of dueSchedules) enqueue(p.id, false)
    } finally {
      ticking = false
    }
  }

  /** Once a day: what the retention lengths have passed goes, and orphan files. */
  let housekept: Date | null = null
  const housekeeping = async () => {
    housekept = new Date()
    await cleanUp(env.db, env.dataDir)
  }
  let housekeepingTimer: ReturnType<typeof setInterval> | undefined

  return {
    /** On boot: runs that died with the last process go stale and their cards back to todo. */
    start: async () => {
      stopping = false
      for (const gone of await markInterruptedRuns(env.db)) {
        if (gone.card_id === null) continue
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
      stopping = true
      if (timer) clearInterval(timer)
      if (housekeepingTimer) clearInterval(housekeepingTimer)
      queue.length = 0
      fullRound.clear()
      for (const handle of env.handles.values()) handle.stop()
      await Promise.allSettled([...active.values()])
    },
    /** "Run now": a round for this project whatever its next_run_at says (still not when paused). */
    runNow: (projectId: number) => {
      env.claude.hold = null // the person asks: try Claude again too
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

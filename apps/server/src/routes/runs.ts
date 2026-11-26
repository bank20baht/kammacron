import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { parseTableQuery, tableQuery } from '@20baht/table-query'
import { and, count, eq, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { AGENTS, cards, projects, RUN_STATUSES, runs, schedules } from '../db/schema'
import { CLAUDE_MODELS, claudeAgents, codexModels, hasCli } from '../services/agents'
import { listAlerts, markAlertsRead } from '../services/alerts'
import { claudeLimits, codexLimits } from '../services/limits'
import { listCronJobs, runsBetween } from '../services/calendar'
import { getCard, moveCard, updateCard } from '../services/cards'
import { conflict, invalid, notFound } from '../services/errors'
import { getProject, updateProject, type Project } from '../services/projects'
import { nextCron } from '../services/cron'
import { getRunWithEvents, listRuns, runLabels, withLabels } from '../services/runs'
import { getSettings } from '../services/settings'
import { approveCard } from '../worker/approve'
import { checkDir } from '../worker/git'
import { childEnv } from '../worker/env'
import { idParams, oneOf } from './params'

const Id = idParams()

type ScheduleShape = {
  command?: string | null | undefined
  playbook?: string | null | undefined
  agent?: string | null | undefined
  prompt?: string | null | undefined
  claude_agent?: string | null | undefined
  cron?: string | null | undefined
}

/**
 * A schedule runs exactly one of a command, a playbook of its project or an agent (with a
 * prompt), Claude perhaps as one of the project's Claude Code agents; its cron expression, when it
 * has one, must name a time that comes.
 */
const checkSchedule = async (project: Project, s: ScheduleShape) => {
  if ([s.command, s.playbook, s.agent].filter(Boolean).length !== 1)
    throw invalid(
      'BAD_SCHEDULE',
      'a schedule runs exactly one of a command, a playbook or an agent',
    )
  if (s.playbook && !project.playbooks.some((p) => p.name === s.playbook))
    throw invalid('BAD_SCHEDULE', `${project.name} has no playbook "${s.playbook}"`)
  if (s.agent && !s.prompt?.trim())
    throw invalid('BAD_SCHEDULE', 'an agent schedule needs a prompt')
  if (s.claude_agent) {
    if (s.agent !== 'claude')
      throw invalid('BAD_SCHEDULE', 'only a Claude cron job runs as a Claude Code agent')
    const agents = await claudeAgents(project.repo_path)
    if (!agents.some((a) => a.name === s.claude_agent))
      throw invalid('BAD_SCHEDULE', `${project.name} has no Claude Code agent "${s.claude_agent}"`)
  }
  if (s.cron && nextCron(s.cron) === null)
    throw invalid('BAD_CRON', `"${s.cron}" never comes (no such day)`)
}

/** What a schedule may say of itself, on create and (each optional) on change. */
const scheduleFields = {
  name: t.String({ minLength: 1, maxLength: 120 }),
  command: t.Nullable(t.String({ minLength: 1 })),
  playbook: t.Nullable(
    t.String({ minLength: 1, description: 'Run this playbook instead of a command' }),
  ),
  agent: t.Nullable(
    oneOf(AGENTS, { description: 'Run this agent with `prompt`: claude or codex' }),
  ),
  prompt: t.Nullable(t.String({ maxLength: 20_000, description: "The agent's task" })),
  use_board: t.Boolean({
    description: "The agent's prompt comes with the open auto-pilot cards and how to take one",
  }),
  model: t.Nullable(t.String({ description: "The agent's model; empty: its default" })),
  claude_agent: t.Nullable(
    t.String({
      minLength: 1,
      maxLength: 200,
      description:
        'Claude runs as this Claude Code agent (list_agent_options); null: Claude itself',
    }),
  ),
  cron: t.Nullable(
    t.String({
      minLength: 1,
      maxLength: 120,
      description:
        'minute hour day-of-month month day-of-week, local time; null: every interval_minutes',
    }),
  ),
  interval_minutes: t.Integer({ minimum: 5, maximum: 7 * 24 * 60 }),
  card_tags: t.Array(t.String()),
  enabled: t.Boolean(),
}

/** A new or changed schedule runs next at its own next time. */
const firstRun = (s: { cron?: string | null | undefined }) =>
  s.cron ? { next_run_at: nextCron(s.cron) } : {}

/** The Runs table's columns, as SQL text the query can search, filter and sort (@20baht/table-query). */
const runsTable = tableQuery(sql, {
  key: sql`${runs.id}`,
  columns: {
    id: sql`${runs.id}::text`,
    card: sql`coalesce('#' || ${runs.card_id}::text || ' ' || ${cards.title}, ${schedules.name}, '')`,
    status: sql`${runs.status}`,
    project: sql`${projects.id}::text`,
    started: sql`to_char(${runs.started_at}, 'YYYY-MM-DD HH24:MI')`,
    error: sql`coalesce(${runs.error_kind}, '')`,
    took: sql`coalesce((${runs.ended_at} - ${runs.started_at})::text, '')`,
    turns: sql`coalesce(${runs.num_turns}::text, '')`,
    cost: sql`coalesce(${runs.cost_usd}::text, '')`,
  },
  term: [
    sql`coalesce(${cards.title}, ${schedules.name}, '')`,
    sql`coalesce(${runs.summary}, '')`,
    sql`coalesce(${runs.error}, '')`,
  ],
  sortAs: {
    id: sql`${runs.id}`,
    started: sql`${runs.started_at}`,
    turns: sql`${runs.num_turns}`,
    cost: sql`${runs.cost_usd}`,
  },
})

export const runRoutes = (ctx: AppContext) =>
  new Elysia()
    .use(liveMacro(ctx.live))
    .get('/runs', ({ query }) => listRuns(ctx.db, query), {
      query: t.Object({
        project_id: t.Optional(t.Numeric()),
        card_id: t.Optional(t.Numeric()),
        status: t.Optional(oneOf(RUN_STATUSES)),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        before: t.Optional(t.Numeric({ description: 'Runs older than this run id' })),
      }),
      live: liveRoute(ctx.live, { topics: () => ['runs'], key: 'id' }),
      detail: { operationId: 'list_runs', summary: 'Worker runs, newest first' },
    })
    .post(
      '/runs/search',
      async ({ body, status }) => {
        const parsed = parseTableQuery(body)
        if (!parsed.ok) return status(400, { code: 'BAD_QUERY', message: parsed.message })
        const unknown = runsTable.unknownColumn(parsed.query)
        if (unknown)
          return status(400, { code: 'UNKNOWN_COLUMN', message: `unknown column ${unknown}` })
        const where = runsTable.where(parsed.query)
        const { limit, offset } = runsTable.page(parsed.query)
        const sorted = runsTable.orderBy(parsed.query)
        const rows = await ctx.db
          .select({ run: runs, ...runLabels, project_name: projects.name })
          .from(runs)
          .leftJoin(cards, eq(cards.id, runs.card_id))
          .leftJoin(schedules, eq(schedules.id, runs.schedule_id))
          .innerJoin(projects, eq(projects.id, runs.project_id))
          .where(where)
          .orderBy(...(sorted.length ? sorted : [sql`${runs.id} desc`]))
          .limit(limit)
          .offset(offset)
        const [total] = await ctx.db
          .select({ n: count() })
          .from(runs)
          .leftJoin(cards, eq(cards.id, runs.card_id))
          .leftJoin(schedules, eq(schedules.id, runs.schedule_id))
          .innerJoin(projects, eq(projects.id, runs.project_id))
          .where(where)
        return {
          rows: rows.map(withLabels),
          total: total?.n ?? 0,
        }
      },
      {
        body: t.Record(t.String(), t.Unknown(), { description: 'A <baht-table> query' }),
        live: liveRoute(ctx.live, { topics: () => ['runs'], key: 'id', rows: 'rows' }),
        detail: {
          operationId: 'search_runs',
          summary: 'Runs searched, filtered, sorted and paged',
        },
      },
    )
    .get(
      '/runs/:id',
      ({ params, query }) => getRunWithEvents(ctx.db, Number(params.id), query.after ?? 0),
      {
        params: idParams('Run id'),
        query: t.Object({
          after: t.Optional(t.Numeric({ description: 'Only events after this seq' })),
        }),
        live: liveRoute(ctx.live, {
          topics: ({ params }) => [
            `runs:${params['id'] ?? ''}`,
            `run_events@run_id=${params['id'] ?? ''}`,
            `run_steps@run_id=${params['id'] ?? ''}`,
          ],
        }),
        detail: {
          operationId: 'get_run',
          summary: "A run's summary, error, permission denials and events: why a run failed",
          mcp: true,
        },
      },
    )
    // Everything below steers the worker: the person's, never a tool.
    .post(
      '/runs/:id/stop',
      ({ params }) => {
        if (!ctx.scheduler?.stopRun(Number(params.id)))
          throw conflict('NOT_RUNNING', `run ${params.id} is not running`)
        return { ok: true as const }
      },
      {
        params: Id,
        detail: { operationId: 'stop_run', summary: 'Stop a run; its card returns to todo' },
      },
    )
    .post(
      '/projects/:id/run-now',
      async ({ params }) => {
        const project = await getProject(ctx.db, Number(params.id))
        if (!project.repo_path) throw conflict('NO_REPO', 'link a repo first')
        if (!ctx.scheduler) throw conflict('NO_WORKER', 'the worker is not running in this process')
        ctx.scheduler.runNow(project.id)
        return { ok: true as const }
      },
      {
        params: Id,
        detail: { operationId: 'run_project_now', summary: 'Run a round of this project now' },
      },
    )
    .post(
      '/projects/:id/resume',
      ({ params }) => updateProject(ctx.db, Number(params.id), { paused_reason: null }),
      {
        params: Id,
        detail: {
          operationId: 'resume_project',
          summary: 'Clear a pause the program set on a project',
        },
      },
    )
    .post(
      '/projects/:id/check-repo',
      async ({ params }) => {
        const project = await getProject(ctx.db, Number(params.id))
        if (!project.repo_path) throw conflict('NO_REPO', 'no directory set')
        return checkDir(project.repo_path, await childEnv(ctx.worker))
      },
      {
        params: Id,
        detail: {
          operationId: 'check_repo',
          summary: 'Is the directory there, and what kammacron finds in it (git, instructions)?',
        },
      },
    )
    .post('/cards/:id/approve', ({ params }) => approveCard(ctx.db, Number(params.id)), {
      params: Id,
      detail: {
        operationId: 'approve_card',
        summary: 'Agree with what a card in review left: it is done',
      },
    })
    .post(
      '/cards/:id/take',
      async ({ params }) => {
        await getCard(ctx.db, Number(params.id))
        return updateCard(ctx.db, Number(params.id), { human: true })
      },
      {
        params: Id,
        detail: { operationId: 'take_card', summary: 'Take a card yourself (sets human)' },
      },
    )
    .get(
      '/status',
      async () => {
        const settings = await getSettings(ctx.db)
        const [review] = await ctx.db
          .select({ n: count() })
          .from(cards)
          .where(and(eq(cards.status, 'review'), eq(cards.archived, false)))
        const running = await ctx.db
          .select({
            run_id: runs.id,
            card_id: runs.card_id,
            project_id: runs.project_id,
            status: runs.status,
            started_at: runs.started_at,
            ...runLabels,
          })
          .from(runs)
          .leftJoin(cards, eq(cards.id, runs.card_id))
          .leftJoin(schedules, eq(schedules.id, runs.schedule_id))
          .where(eq(runs.status, 'running'))
        const paused = await ctx.db
          .select({ id: projects.id, name: projects.name, reason: projects.paused_reason })
          .from(projects)
          .where(and(eq(projects.archived, false)))
          .then((rows) => rows.filter((r) => r.reason !== null))
        const unread = (await listAlerts(ctx.db, { unread: true, limit: 200 })).length
        return {
          paused: settings.paused,
          running,
          review: review?.n ?? 0,
          paused_projects: paused,
          unread_alerts: unread,
        }
      },
      {
        live: liveRoute(ctx.live, {
          topics: () => ['settings', 'runs', 'cards', 'projects', 'alerts'],
        }),
        detail: {
          operationId: 'get_status',
          summary: 'Paused or working, the run going, cards in review',
        },
      },
    )
    .get(
      '/limits',
      async () => {
        const path = (await childEnv(ctx.worker))['PATH'] ?? ''
        return {
          claude: hasCli(ctx.worker.claudeBin, path) ? await claudeLimits(ctx.db) : null,
          codex: hasCli(ctx.worker.codexBin, path) ? await codexLimits() : null,
        }
      },
      {
        detail: {
          operationId: 'get_usage_limits',
          summary:
            "How much of Claude's and Codex's usage windows is spent (null for a CLI this machine has not): Claude's as kammacron's last Claude run reported them, Codex's from its session files",
        },
      },
    )
    .get('/alerts', ({ query }) => listAlerts(ctx.db, { unread: query.unread ?? false }), {
      query: t.Object({ unread: t.Optional(t.BooleanString()) }),
      live: liveRoute(ctx.live, { topics: () => ['alerts'], key: 'id' }),
      detail: { operationId: 'list_alerts', summary: 'What the program wants you to see' },
    })
    .post(
      '/alerts/read',
      async ({ body }) => {
        await markAlertsRead(ctx.db, body.ids)
        return { ok: true as const }
      },
      {
        body: t.Object({ ids: t.Array(t.Integer()) }),
        detail: { operationId: 'read_alerts', summary: 'Mark alerts read' },
      },
    )
    .get(
      '/calendar',
      async ({ query, status }) => {
        const from = new Date(query.from)
        const to = new Date(query.to)
        if (!(from < to) || to.getTime() - from.getTime() > 62 * 86_400_000)
          return status(400, {
            code: 'BAD_RANGE',
            message: 'from must come before to, at most 62 days apart',
          })
        const loop = ctx.scheduler ? await ctx.scheduler.status() : null
        return {
          jobs: await listCronJobs(ctx.db, loop, { from, to }),
          runs: await runsBetween(ctx.db, from, to),
        }
      },
      {
        query: t.Object({
          from: t.String({ format: 'date-time', description: 'Start of the range (ISO instant)' }),
          to: t.String({ format: 'date-time', description: 'End of the range, excluded' }),
        }),
        live: liveRoute(ctx.live, { topics: () => ['projects', 'schedules', 'runs', 'settings'] }),
        detail: {
          operationId: 'get_calendar',
          summary:
            'The cron jobs (worker rounds, schedules, housekeeping) with their next run, and the runs in a range',
          mcp: true,
        },
      },
    )
    .get(
      '/projects/:id/agents',
      async ({ params }) => {
        const project = await getProject(ctx.db, Number(params.id))
        const path = (await childEnv(ctx.worker))['PATH'] ?? ''
        const claude = hasCli(ctx.worker.claudeBin, path)
        const codex = hasCli(ctx.worker.codexBin, path)
        return {
          claude: claude
            ? {
                agents: (await claudeAgents(project.repo_path)).map(
                  ({ name, description, source, model, tools }) => ({
                    name,
                    description,
                    source,
                    model,
                    tools,
                  }),
                ),
                models: CLAUDE_MODELS,
              }
            : null,
          codex: codex ? { models: await codexModels() } : null,
        }
      },
      {
        params: Id,
        detail: {
          operationId: 'list_agent_options',
          summary:
            "What a project's cron job can run: Claude and Codex when this machine has them (null when not), Claude Code agents the project can call on, and each one's models",
        },
      },
    )
    .get(
      '/projects/:id/schedules',
      ({ params }) =>
        ctx.db
          .select()
          .from(schedules)
          .where(eq(schedules.project_id, Number(params.id))),
      {
        params: Id,
        live: liveRoute(ctx.live, { topics: () => ['schedules'], key: 'id' }),
        detail: {
          operationId: 'list_schedules',
          summary: 'The cron jobs of a project: commands, playbooks and agents on a timer',
        },
      },
    )
    .post(
      '/projects/:id/schedules',
      async ({ params, body }) => {
        await checkSchedule(await getProject(ctx.db, Number(params.id)), body)
        const [row] = await ctx.db
          .insert(schedules)
          // a failure's card is for a person unless the schedule says who else takes it
          .values({
            ...body,
            ...firstRun(body),
            card_tags: body.card_tags ?? [],
            project_id: Number(params.id),
          })
          .returning()
        return row
      },
      {
        params: Id,
        body: t.Composite([
          t.Object({ name: scheduleFields.name }),
          t.Partial(t.Omit(t.Object(scheduleFields), ['name'])),
        ]),
        detail: {
          operationId: 'create_schedule',
          summary: 'Add a cron job: a command, a playbook, or Claude or Codex with a prompt',
        },
      },
    )
    .patch(
      '/schedules/:id',
      async ({ params, body }) => {
        const [current] = await ctx.db
          .select()
          .from(schedules)
          .where(eq(schedules.id, Number(params.id)))
        if (!current) throw notFound('schedule', params.id)
        await checkSchedule(await getProject(ctx.db, current.project_id), { ...current, ...body })
        const [row] = await ctx.db
          .update(schedules)
          .set({ ...body, ...('cron' in body ? firstRun(body) : {}) })
          .where(eq(schedules.id, Number(params.id)))
          .returning()
        if (!row) throw notFound('schedule', params.id)
        return row
      },
      {
        params: Id,
        body: t.Partial(t.Object(scheduleFields)),
        detail: { operationId: 'update_schedule', summary: 'Change or turn off a schedule' },
      },
    )
    .post(
      '/cards/:id/return',
      ({ params }) => moveCard(ctx.db, Number(params.id), { status: 'todo' }),
      {
        params: Id,
        detail: { operationId: 'return_card', summary: 'Put a card back in todo' },
      },
    )

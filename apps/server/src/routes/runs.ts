import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { parseTableQuery, tableQuery } from '@20baht/table-query'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { cards, projects, RUN_STATUSES, runs, schedules } from '../db/schema'
import { listAlerts, markAlertsRead } from '../services/alerts'
import { getCard, moveCard, updateCard } from '../services/cards'
import { conflict, notFound } from '../services/errors'
import { getProject, updateProject } from '../services/projects'
import { getRunWithEvents, listRuns } from '../services/runs'
import { getSettings } from '../services/settings'
import { approveCard } from '../worker/approve'
import { checkRepo } from '../worker/git'
import { childEnv } from '../worker/env'
import { idParams, oneOf } from './params'

const Id = idParams()

/** The Runs table's columns, as SQL text the query can search, filter and sort (@20baht/table-query). */
const runsTable = tableQuery(sql, {
  key: sql`${runs.id}`,
  columns: {
    id: sql`${runs.id}::text`,
    card: sql`'#' || ${runs.card_id}::text || ' ' || ${cards.title}`,
    status: sql`${runs.status}`,
    project: sql`${projects.id}::text`,
    started: sql`to_char(${runs.started_at}, 'YYYY-MM-DD HH24:MI')`,
    pushed: sql`coalesce(${runs.pushed_to}, '')`,
    error: sql`coalesce(${runs.error_kind}, '')`,
    took: sql`coalesce((${runs.ended_at} - ${runs.started_at})::text, '')`,
    turns: sql`coalesce(${runs.num_turns}::text, '')`,
    cost: sql`coalesce(${runs.cost_usd}::text, '')`,
  },
  term: [sql`${cards.title}`, sql`coalesce(${runs.summary}, '')`, sql`coalesce(${runs.error}, '')`],
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
          .select({ run: runs, card_title: cards.title, project_name: projects.name })
          .from(runs)
          .innerJoin(cards, eq(cards.id, runs.card_id))
          .innerJoin(projects, eq(projects.id, runs.project_id))
          .where(where)
          .orderBy(...(sorted.length ? sorted : [sql`${runs.id} desc`]))
          .limit(limit)
          .offset(offset)
        const [total] = await ctx.db
          .select({ n: count() })
          .from(runs)
          .innerJoin(cards, eq(cards.id, runs.card_id))
          .innerJoin(projects, eq(projects.id, runs.project_id))
          .where(where)
        return {
          rows: rows.map((r) => ({ ...r.run, card_title: r.card_title })),
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
        if (!project.repo_path) throw conflict('NO_REPO', 'no repo_path set')
        const result = await checkRepo(project.repo_path, await childEnv(ctx.worker))
        if (result.default_branch && !project.default_branch)
          await updateProject(ctx.db, project.id, { default_branch: result.default_branch })
        return result
      },
      {
        params: Id,
        detail: {
          operationId: 'check_repo',
          summary: 'Is the linked path a repo with origin, a default branch and a pre-push hook?',
        },
      },
    )
    .post('/cards/:id/approve', ({ params }) => approveCard(ctx.worker, Number(params.id)), {
      params: Id,
      detail: {
        operationId: 'approve_card',
        summary: 'Rebase claude/<card> onto the default branch and push it',
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
            card_title: cards.title,
          })
          .from(runs)
          .innerJoin(cards, eq(cards.id, runs.card_id))
          .where(inArray(runs.status, ['running', 'verifying']))
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
          summary: 'Commands on a schedule that open a card when they fail',
        },
      },
    )
    .post(
      '/projects/:id/schedules',
      async ({ params, body }) => {
        await getProject(ctx.db, Number(params.id))
        const [row] = await ctx.db
          .insert(schedules)
          .values({ ...body, project_id: Number(params.id) })
          .returning()
        return row
      },
      {
        params: Id,
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          command: t.String({ minLength: 1 }),
          interval_minutes: t.Optional(t.Integer({ minimum: 5, maximum: 7 * 24 * 60 })),
          card_tags: t.Optional(t.Array(t.String())),
          enabled: t.Optional(t.Boolean()),
        }),
        detail: { operationId: 'create_schedule', summary: 'Add a schedule' },
      },
    )
    .patch(
      '/schedules/:id',
      async ({ params, body }) => {
        const [row] = await ctx.db
          .update(schedules)
          .set(body)
          .where(eq(schedules.id, Number(params.id)))
          .returning()
        if (!row) throw notFound('schedule', params.id)
        return row
      },
      {
        params: Id,
        body: t.Partial(
          t.Object({
            name: t.String({ minLength: 1, maxLength: 120 }),
            command: t.String({ minLength: 1 }),
            interval_minutes: t.Integer({ minimum: 5, maximum: 7 * 24 * 60 }),
            card_tags: t.Array(t.String()),
            enabled: t.Boolean(),
          }),
        ),
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

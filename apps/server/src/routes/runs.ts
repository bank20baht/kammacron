import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { parseTableQuery, tableQuery } from '@20baht/table-query'
import { count, eq, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { cards, projects, RUN_STATUSES, runs, schedules } from '../db/schema'
import { getRunWithEvents, listRuns, runLabels, withLabels } from '../services/runs'
import { idParams, oneOf } from './params'

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

/** Runs as a person and an agent read them: the list, the searched table, one run with its events. */
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
      ({ params, query }) =>
        getRunWithEvents(ctx.db, Number(params.id), { after: query.after, before: query.before }),
      {
        params: idParams('Run id'),
        query: t.Object({
          after: t.Optional(t.Numeric({ description: 'Only events after this seq, oldest first' })),
          before: t.Optional(
            t.Numeric({ description: 'The page of events just before this seq (earlier ones)' }),
          ),
        }),
        // keyed by seq: while a run streams, a viewer gets the new events, not the whole run again
        live: liveRoute(ctx.live, {
          topics: ({ params }) => [
            `runs:${params['id'] ?? ''}`,
            `run_events@run_id=${params['id'] ?? ''}`,
            `run_steps@run_id=${params['id'] ?? ''}`,
          ],
          key: 'seq',
          rows: 'events',
        }),
        detail: {
          operationId: 'get_run',
          summary:
            "A run's summary, error, permission denials and its newest 200 events (`before` for earlier ones, `events_total` for how many): why a run failed",
          mcp: true,
        },
      },
    )

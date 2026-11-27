import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { and, count, eq, isNotNull } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { cards, projects, runs, schedules } from '../db/schema'
import { hasCli } from '../services/agents'
import { countUnreadAlerts, listAlerts, markAlertsRead } from '../services/alerts'
import { listCronJobs, runsBetween } from '../services/calendar'
import { claudeLimits, codexLimits } from '../services/limits'
import { runLabels } from '../services/runs'
import { getSettings } from '../services/settings'
import { childEnv } from '../worker/env'

/** How the install is doing: the status band, usage limits, alerts and the calendar. */
export const statusRoutes = (ctx: AppContext) =>
  new Elysia()
    .use(liveMacro(ctx.live))
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
          .where(and(eq(projects.archived, false), isNotNull(projects.paused_reason)))
        const unread = await countUnreadAlerts(ctx.db)
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

import { homedir } from 'node:os'

import { and, eq, gte, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { runs } from '../db/schema'
import { getSettings } from '../services/settings'
import { childEnv } from '../worker/env'
import { exec } from '../worker/git'

/** Where a tool is on the worker's PATH, and its version line. */
const locate = async (name: string, env: Record<string, string>) => {
  const where = await exec(['sh', '-c', `command -v ${name}`], { cwd: homedir(), env })
  if (where.code !== 0) return { name, path: null, version: null }
  const path = where.stdout.trim()
  const version = await exec([path, '--version'], { cwd: homedir(), env, timeoutMs: 10_000 })
  return { name, path, version: (version.stdout || version.stderr).trim().split('\n')[0] ?? null }
}

/** Settings' system box and the weekly numbers. None are tools. */
export const adminRoutes = (ctx: AppContext) =>
  new Elysia()
    .get(
      '/system',
      async () => {
        const env = await childEnv(ctx.worker)
        const settings = await getSettings(ctx.db)
        const tools = await Promise.all(
          ['claude', 'codex', 'git', 'bun'].map((name) => locate(name, env)),
        )
        return {
          data_dir: ctx.worker.dataDir,
          path: env['PATH'] ?? '',
          path_source: settings.worker_path ? ('settings' as const) : ('process' as const),
          tools,
          platform: process.platform,
          worker: ctx.scheduler !== null,
        }
      },
      { detail: { operationId: 'get_system', summary: 'The tools the worker finds, and where' } },
    )
    .get(
      '/stats',
      async ({ query }) => {
        const weeks = query.weeks ?? 8
        const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60_000)
        const where =
          query.project_id === undefined
            ? gte(runs.started_at, since)
            : and(gte(runs.started_at, since), eq(runs.project_id, query.project_id))
        const rows = await ctx.db
          .select({
            week: sql<string>`to_char(date_trunc('week', ${runs.started_at}), 'YYYY-MM-DD')`,
            runs: sql<number>`count(*)::int`,
            done: sql<number>`count(*) filter (where ${runs.status} = 'succeeded')::int`,
            review: sql<number>`count(*) filter (where ${runs.status} = 'review')::int`,
            failed: sql<number>`count(*) filter (where ${runs.status} in ('failed', 'stale', 'stopped'))::int`,
            cost: sql<number>`coalesce(sum(${runs.cost_usd}), 0)::float`,
            turns: sql<number>`coalesce(sum(${runs.num_turns}), 0)::int`,
          })
          .from(runs)
          .where(where)
          .groupBy(sql`1`)
          .orderBy(sql`1`)
        const total = rows.reduce(
          (acc, r) => ({
            runs: acc.runs + r.runs,
            done: acc.done + r.done,
            review: acc.review + r.review,
            cost: acc.cost + r.cost,
          }),
          { runs: 0, done: 0, review: 0, cost: 0 },
        )
        return {
          weeks: rows,
          total: { ...total, review_rate: total.runs ? total.review / total.runs : 0 },
        }
      },
      {
        query: t.Object({
          weeks: t.Optional(t.Numeric({ minimum: 1, maximum: 52 })),
          project_id: t.Optional(t.Numeric()),
        }),
        detail: {
          operationId: 'get_stats',
          summary: 'Runs per week: done, to review, failed, cost',
        },
      },
    )

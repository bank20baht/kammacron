import { homedir } from 'node:os'

import { and, eq, gte, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { cards, runs } from '../db/schema'
import { writeSecrets } from '../secrets'
import { conflict } from '../services/errors'
import { getProject } from '../services/projects'
import { getSettings } from '../services/settings'
import { cardBranch, childEnv } from '../worker/env'
import { defaultBranch, exec, gitIn } from '../worker/git'
import { worktreeDir } from '../worker/runner'
import { idParams } from './params'

/** Where a tool is on the worker's PATH, and its version line. */
const locate = async (name: string, env: Record<string, string>) => {
  const where = await exec(['sh', '-c', `command -v ${name}`], { cwd: homedir(), env })
  if (where.code !== 0) return { name, path: null, version: null }
  const path = where.stdout.trim()
  const version = await exec([path, '--version'], { cwd: homedir(), env, timeoutMs: 10_000 })
  return { name, path, version: (version.stdout || version.stderr).trim().split('\n')[0] ?? null }
}

/** Settings' system box, the Claude token, review diffs and the weekly numbers. None are tools. */
export const adminRoutes = (ctx: AppContext) =>
  new Elysia()
    .get(
      '/system',
      async () => {
        const env = await childEnv(ctx.worker)
        const settings = await getSettings(ctx.db)
        const tools = await Promise.all(['claude', 'git', 'bun'].map((name) => locate(name, env)))
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
    .put(
      '/settings/claude-token',
      async ({ body }) => {
        ctx.secrets.claude_oauth_token = body.token.trim() || undefined
        await writeSecrets(ctx.secretsPath, ctx.secrets)
        return { ok: true as const }
      },
      {
        body: t.Object({
          token: t.String({ description: 'From `claude setup-token`; empty clears it' }),
        }),
        detail: {
          operationId: 'set_claude_token',
          summary: 'Keep CLAUDE_CODE_OAUTH_TOKEN in secrets.json',
        },
      },
    )
    .post(
      '/settings/claude-test',
      async () => {
        const env = await childEnv(ctx.worker)
        const r = await exec(
          [
            ctx.worker.claudeBin,
            '-p',
            '--model',
            'haiku',
            '--max-turns',
            '1',
            '--output-format',
            'json',
            '--strict-mcp-config',
          ],
          { cwd: homedir(), env, input: 'Reply with the single word: ok', timeoutMs: 120_000 },
        )
        let result: { is_error?: boolean; result?: string; api_error_status?: number | null } = {}
        try {
          result = JSON.parse(r.stdout) as typeof result
        } catch {
          // not JSON: the binary is missing, or it crashed before answering
        }
        const ok = r.code === 0 && result.is_error !== true
        return {
          ok,
          message: ok
            ? (result.result ?? 'ok').trim()
            : (result.result ?? r.stderr.trim()) || `exit ${String(r.code)}`,
        }
      },
      {
        detail: { operationId: 'test_claude', summary: 'One short claude -p, to check the token' },
      },
    )
    .get(
      '/cards/:id/diff',
      async ({ params }) => {
        const [card] = await ctx.db
          .select()
          .from(cards)
          .where(eq(cards.id, Number(params.id)))
        if (!card?.branch)
          return {
            branch: null,
            stat: '',
            files: [] as { path: string; added: number; removed: number }[],
          }
        const project = await getProject(ctx.db, card.project_id)
        if (!project.repo_path) throw conflict('NO_REPO', 'the project has no repo')
        const env = await childEnv(ctx.worker)
        const branchName =
          project.default_branch ?? (await defaultBranch(gitIn(project.repo_path, env)))
        const dir = worktreeDir(ctx.worker, project)
        const git = gitIn((await Bun.file(`${dir}/.git`).exists()) ? dir : project.repo_path, env)
        await git.run('fetch', 'origin', '--prune')
        const range = `origin/${branchName ?? 'main'}...origin/${cardBranch(card.id)}`
        const stat = await git.run('diff', '--stat', range)
        const numstat = await git.run('diff', '--numstat', range)
        const files = numstat.stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [added, removed, path] = line.split('\t')
            return { path: path ?? '', added: Number(added) || 0, removed: Number(removed) || 0 }
          })
        return { branch: card.branch, stat: stat.stdout.trim(), files }
      },
      {
        params: idParams(),
        detail: {
          operationId: 'card_diff',
          summary: 'What claude/<card> changes against the default branch',
        },
      },
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
            reverted: sql<number>`count(*) filter (where ${runs.status} = 'reverted')::int`,
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
          summary: 'Runs per week: done, to review, reverted, cost',
        },
      },
    )

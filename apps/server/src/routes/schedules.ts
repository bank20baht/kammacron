import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { AGENTS } from '../db/schema'
import { CLAUDE_MODELS, claudeAgents, codexModels, hasCli } from '../services/agents'
import { nextCron } from '../services/cron'
import { invalid, notFound } from '../services/errors'
import { getProject, type Project } from '../services/projects'
import { removeSchedule } from '../services/retention'
import { createSchedule, getSchedule, listSchedules, updateSchedule } from '../services/schedules'
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

/** A project's cron jobs, and what one can run on this machine. */
export const scheduleRoutes = (ctx: AppContext) =>
  new Elysia()
    .use(liveMacro(ctx.live))
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
    .get('/projects/:id/schedules', ({ params }) => listSchedules(ctx.db, Number(params.id)), {
      params: Id,
      live: liveRoute(ctx.live, { topics: () => ['schedules'], key: 'id' }),
      detail: {
        operationId: 'list_schedules',
        summary: 'The cron jobs of a project: commands, playbooks and agents on a timer',
      },
    })
    .post(
      '/projects/:id/schedules',
      async ({ params, body }) => {
        await checkSchedule(await getProject(ctx.db, Number(params.id)), body)
        return createSchedule(ctx.db, Number(params.id), { ...body, ...firstRun(body) })
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
        const current = await getSchedule(ctx.db, Number(params.id))
        await checkSchedule(await getProject(ctx.db, current.project_id), { ...current, ...body })
        return updateSchedule(ctx.db, current.id, {
          ...body,
          ...('cron' in body ? firstRun(body) : {}),
        })
      },
      {
        params: Id,
        body: t.Partial(t.Object(scheduleFields)),
        detail: { operationId: 'update_schedule', summary: 'Change or turn off a schedule' },
      },
    )
    // a person's to do, never an agent's: not an MCP tool
    .delete(
      '/schedules/:id',
      async ({ params }) => {
        const gone = await removeSchedule(ctx.db, Number(params.id))
        if (!gone) throw notFound('schedule', params.id)
        return gone
      },
      {
        params: Id,
        detail: {
          operationId: 'delete_schedule',
          summary: 'Remove a cron job (its runs stay); turning it off keeps it',
        },
      },
    )

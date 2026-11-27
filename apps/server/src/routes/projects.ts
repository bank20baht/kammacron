import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { idParams, oneOf } from './params'
import { and, eq } from 'drizzle-orm'

import { runs } from '../db/schema'
import { conflict, invalid } from '../services/errors'
import { createProject, getProject, listProjects, updateProject } from '../services/projects'
import { removeProject } from '../services/retention'
import { childEnv } from '../worker/env'
import { approveMcpServers } from '../worker/mcp-approvals'
import { gitIn, localGit } from '../worker/git'

const Id = idParams()

const StepName = t.String({ minLength: 1, maxLength: 80 })

/** The steps a run takes with a card; checked here, so the runner only meets good ones. */
const Steps = t.Array(
  t.Union([
    t.Object(
      {
        kind: t.Literal('claude'),
        name: StepName,
        prompt: t.Optional(t.String({ maxLength: 20_000 })),
        model: t.Optional(t.String({ minLength: 1 })),
        max_turns: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
        allow: t.Optional(t.Array(t.String({ minLength: 1 }))),
      },
      { additionalProperties: false },
    ),
    t.Object(
      {
        kind: t.Literal('run'),
        name: StepName,
        command: t.String({ minLength: 1, maxLength: 20_000 }),
        timeout_minutes: t.Optional(t.Integer({ minimum: 1, maximum: 720 })),
        continue_on_error: t.Optional(t.Boolean()),
      },
      { additionalProperties: false },
    ),
  ]),
  { minItems: 1, maxItems: 50, description: 'What a run does with a card, step by step' },
)

const Playbooks = t.Array(
  t.Object(
    {
      name: t.String({
        pattern: '^[a-z0-9][a-z0-9-]{0,39}$',
        description: 'Lowercase, digits and "-"; a card picks it with the tag playbook:<name>',
      }),
      steps: Steps,
    },
    { additionalProperties: false },
  ),
  { minItems: 1, maxItems: 30, description: 'The project\'s playbooks; one is named "default"' },
)

const ProjectFields = {
  name: t.String({ minLength: 1, maxLength: 120 }),
  repo_path: t.Optional(t.Nullable(t.String())),
  worker_enabled: t.Optional(t.Boolean()),
  interval_minutes: t.Optional(t.Integer({ minimum: 1, maximum: 1440 })),
  max_cards_per_run: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
  max_turns: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
  model: t.Optional(t.Nullable(t.String())),
  extra_prompt: t.Optional(t.String()),
  allowed_bash: t.Optional(t.Array(t.String())),
  enabled_mcp_servers: t.Optional(t.Array(t.String())),
  web_tools: t.Optional(t.Boolean()),
  mode: t.Optional(oneOf(['watch', 'autopilot'])),
  playbooks: t.Optional(Playbooks),
}

export const projectRoutes = (ctx: AppContext) => {
  /** Saving the MCP server choice approves what those names mean now. */
  const approved = async <T extends Parameters<typeof approveMcpServers>[1]>(
    saved: Promise<T>,
    chose: boolean,
  ) => {
    const project = await saved
    if (chose) await approveMcpServers(ctx.worker.dataDir, project)
    return project
  }

  return (
    new Elysia()
      .use(liveMacro(ctx.live))
      .get(
        '/projects',
        ({ query }) => listProjects(ctx.db, { archived: query.archived ?? false }),
        {
          query: t.Object({
            archived: t.Optional(
              t.BooleanString({ description: 'true: archived projects instead' }),
            ),
          }),
          live: liveRoute(ctx.live, { topics: () => ['projects'], key: 'id' }),
          detail: {
            operationId: 'list_projects',
            summary: 'The projects cards belong to',
            mcp: true,
          },
        },
      )
      .get('/projects/:id', ({ params }) => getProject(ctx.db, Number(params.id)), {
        params: Id,
        detail: { operationId: 'get_project', summary: 'One project' },
      })
      .get(
        '/projects/:id/git',
        async ({ params }) => {
          const project = await getProject(ctx.db, Number(params.id))
          const none = { repo: false, branch: null, dirty: false, ahead: null, behind: null }
          const local = project.repo_path
            ? await localGit(gitIn(project.repo_path, await childEnv(ctx.worker)))
            : none
          return local
        },
        {
          params: Id,
          detail: {
            operationId: 'project_git',
            summary:
              "The project directory's branch, uncommitted changes, and how far it is from origin",
          },
        },
      )
      // Project settings steer the worker (its tools, its prompt): never tools.
      .post(
        '/projects',
        ({ body }) => approved(createProject(ctx.db, body), body.enabled_mcp_servers !== undefined),
        {
          body: t.Object({ slug: t.String(), ...ProjectFields }),
          detail: { operationId: 'create_project', summary: 'Create a project' },
        },
      )
      .patch(
        '/projects/:id',
        ({ params, body }) =>
          approved(
            updateProject(ctx.db, Number(params.id), body),
            body.enabled_mcp_servers !== undefined,
          ),
        {
          params: Id,
          body: t.Partial(t.Object({ slug: t.String(), archived: t.Boolean(), ...ProjectFields })),
          detail: { operationId: 'update_project', summary: 'Change a project' },
        },
      )
      // a person's to do, never an agent's (not an MCP tool), and only when they name it
      .delete(
        '/projects/:id',
        async ({ params, query }) => {
          const project = await getProject(ctx.db, Number(params.id))
          if (query.confirm !== project.name && query.confirm !== project.slug)
            throw invalid('CONFIRM_NAME', "type the project's name to remove it")
          const [running] = await ctx.db
            .select({ id: runs.id })
            .from(runs)
            .where(and(eq(runs.project_id, project.id), eq(runs.status, 'running')))
          if (running)
            throw conflict('RUN_GOING', `run ${String(running.id)} is going: stop it first`)
          await removeProject(ctx.db, ctx.worker.dataDir, project.id)
          return { ok: true as const }
        },
        {
          params: Id,
          query: t.Object({ confirm: t.String() }),
          detail: {
            operationId: 'delete_project',
            summary:
              'Remove a project with its cards, runs and cron jobs; `confirm` is its name or slug',
          },
        },
      )
  )
}

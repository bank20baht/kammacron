import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { idParams, oneOf } from './params'
import { createProject, getProject, listProjects, updateProject } from '../services/projects'
import { childEnv } from '../worker/env'
import { gitIn, localGit } from '../worker/git'

const Id = idParams()

const StepName = t.String({ minLength: 1, maxLength: 80 })

/** The steps a run takes with a card; checked here, so the runner only meets good ones. */
const Playbook = t.Array(
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
  playbook: t.Optional(Playbook),
}

export const projectRoutes = (ctx: AppContext) =>
  new Elysia()
    .use(liveMacro(ctx.live))
    .get('/projects', ({ query }) => listProjects(ctx.db, { archived: query.archived ?? false }), {
      query: t.Object({
        archived: t.Optional(t.BooleanString({ description: 'true: archived projects instead' })),
      }),
      live: liveRoute(ctx.live, { topics: () => ['projects'], key: 'id' }),
      detail: { operationId: 'list_projects', summary: 'The projects cards belong to', mcp: true },
    })
    .get('/projects/:id', ({ params }) => getProject(ctx.db, Number(params.id)), {
      params: Id,
      detail: { operationId: 'get_project', summary: 'One project' },
    })
    .get(
      '/projects/:id/git',
      async ({ params }) => {
        const project = await getProject(ctx.db, Number(params.id))
        const none = { branch: null, dirty: false, ahead: null, behind: null }
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
    .post('/projects', ({ body }) => createProject(ctx.db, body), {
      body: t.Object({ slug: t.String(), ...ProjectFields }),
      detail: { operationId: 'create_project', summary: 'Create a project' },
    })
    .patch('/projects/:id', ({ params, body }) => updateProject(ctx.db, Number(params.id), body), {
      params: Id,
      body: t.Partial(t.Object({ slug: t.String(), archived: t.Boolean(), ...ProjectFields })),
      detail: { operationId: 'update_project', summary: 'Change a project' },
    })

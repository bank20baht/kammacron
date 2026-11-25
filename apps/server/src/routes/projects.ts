import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { idParams, oneOf } from './params'
import { createProject, getProject, listProjects, updateProject } from '../services/projects'

const Id = idParams()

const ProjectFields = {
  name: t.String({ minLength: 1, maxLength: 120 }),
  repo_path: t.Optional(t.Nullable(t.String())),
  default_branch: t.Optional(t.Nullable(t.String())),
  worker_enabled: t.Optional(t.Boolean()),
  interval_minutes: t.Optional(t.Integer({ minimum: 1, maximum: 1440 })),
  max_cards_per_run: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
  max_turns: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
  model: t.Optional(t.Nullable(t.String())),
  extra_prompt: t.Optional(t.String()),
  allowed_bash: t.Optional(t.Array(t.String())),
  copy_files: t.Optional(t.Array(t.String())),
  setup_command: t.Optional(t.Nullable(t.String())),
  verify_command: t.Optional(t.Nullable(t.String())),
  enabled_mcp_servers: t.Optional(t.Array(t.String())),
  web_tools: t.Optional(t.Boolean()),
  mode: t.Optional(oneOf(['watch', 'autopilot'])),
  ship_policy: t.Optional(oneOf(['push', 'branch'])),
  worktree_path: t.Optional(t.Nullable(t.String())),
  verify_timeout_minutes: t.Optional(t.Integer({ minimum: 1, maximum: 240 })),
  lock_files: t.Optional(t.Array(t.String())),
  max_diff_lines: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  protected_paths: t.Optional(t.Array(t.String())),
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

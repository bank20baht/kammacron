import { Elysia } from 'elysia'

import type { AppContext } from '../context'
import { getCard, moveCard, updateCard } from '../services/cards'
import { conflict } from '../services/errors'
import { getProject, updateProject } from '../services/projects'
import { approveCard } from '../worker/approve'
import { childEnv } from '../worker/env'
import { checkDir } from '../worker/git'
import { idParams } from './params'

const Id = idParams()

/**
 * What steers the worker: stop a run, run a project now, resume it, and the review decisions on a
 * card. The person's, never a tool: none of these is offered over MCP.
 */
export const workerRoutes = (ctx: AppContext) =>
  new Elysia()
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
    .post(
      '/cards/:id/return',
      ({ params }) => moveCard(ctx.db, Number(params.id), { status: 'todo' }),
      {
        params: Id,
        detail: { operationId: 'return_card', summary: 'Put a card back in todo' },
      },
    )

import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { conflict, notFound } from '../services/errors'
import { localSessions, stopProcess, type LocalSession } from '../services/local-sessions'
import { oneOf } from './params'

/**
 * The Claude Code and Codex sessions open on this machine, and Stop for them. The person's only:
 * none of these is an MCP tool, so an agent can neither list the others nor end one.
 */
export const localSessionRoutes = (ctx: AppContext) => {
  /** The kammacron run a process belongs to, by the step's process it has going. */
  const runOf = (pid: number) => {
    for (const [runId, handle] of ctx.worker.handles) if (handle.pid === pid) return runId
    return null
  }
  const list = () => localSessions(runOf)

  /** A run of kammacron's own stops through its run (the card goes back); any other, by signal. */
  const stop = async (session: LocalSession) => {
    if (session.run_id !== null && ctx.scheduler?.stopRun(session.run_id)) return true
    if (!session.stoppable || session.pid === null) return false
    return stopProcess(session.pid)
  }

  return new Elysia()
    .get('/local-sessions', () => list(), {
      detail: {
        operationId: 'list_local_sessions',
        summary:
          'The Claude Code and Codex sessions open on this machine: working or idle, the tokens of the last minutes, how each pays',
      },
    })
    .post(
      '/local-sessions/stop',
      async ({ body }) => {
        const session = (await list()).find((s) => s.agent === body.agent && s.id === body.id)
        if (!session) throw notFound('session', body.id)
        if (!session.stoppable && session.run_id === null)
          throw conflict('NOT_STOPPABLE', 'this session has no process of its own to end')
        return { stopped: await stop(session) }
      },
      {
        body: t.Object({
          agent: oneOf(['claude', 'codex'] as const),
          id: t.String({ minLength: 1 }),
        }),
        detail: {
          operationId: 'stop_local_session',
          summary: "End a session's process (its conversation is kept; resume takes it up again)",
        },
      },
    )
    .post(
      '/local-sessions/stop-working',
      async () => {
        const going = (await list()).filter((s) => s.status !== 'idle')
        const results = await Promise.all(going.map(async (s) => ({ s, stopped: await stop(s) })))
        return {
          stopped: results.filter((r) => r.stopped).map((r) => r.s.id),
          left: results.filter((r) => !r.stopped).map((r) => r.s.id),
        }
      },
      {
        detail: {
          operationId: 'stop_working_local_sessions',
          summary: 'End every session that is working or in a command, kammacron runs included',
        },
      },
    )
}

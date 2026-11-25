import { openapi } from '@elysiajs/openapi'
import { mcpify } from '@20baht/elysia-openapi-mcp'
import { bindLive, livePlugin } from '@20baht/live/elysia'
import { Elysia } from 'elysia'

import { authGuard, isAuthenticated } from './auth'
import type { AppContext } from './context'
import { cardRoutes, CARD_RULES } from './routes/cards'
import { fileApiRoutes, fileRoutes } from './routes/files'
import { projectRoutes } from './routes/projects'
import { runRoutes } from './routes/runs'
import { systemRoutes } from './routes/system'
import { staticRoutes } from './static'
import { ServiceError } from './services/errors'

const MCP_INSTRUCTIONS = `kammacron is a Kanban board whose "claude"-tagged cards are worked by an unattended Claude worker.
Cards are numbered (#12). Use list_projects for project ids, list_cards to find cards, get_card for one card in full.
${CARD_RULES}
Moving a card to review needs a reason. Nothing is ever deleted: archive_card instead.
To show an image (a screenshot of a bug), upload it with upload_image and put the markdown it returns in the card body or a comment.`

/**
 * The whole HTTP surface. Keep imports extensionless (`./x`, never `./x.ts`): the web app compiles
 * this file's declarations, and Angular's compiler rejects `.ts` specifiers.
 */
export const buildApp = (ctx: AppContext) => {
  const app = new Elysia()
    .use(authGuard(ctx.auth))
    .use(livePlugin(ctx.live))
    // global, and by `instanceof`: the route modules are plugins, where neither a local hook nor
    // a code registered with `.error()` on this instance would reach
    .onError({ as: 'global' }, ({ error }) => {
      if (error instanceof ServiceError)
        return Response.json(
          { code: error.code, message: error.message },
          { status: error.httpStatus },
        )
      return undefined
    })
    .use(
      openapi({
        path: '/api/docs',
        specPath: '/openapi/json',
        documentation: { info: { title: 'kammacron', version: '0.0.0' } },
      }),
    )
    .use(
      mcpify({
        name: 'kammacron',
        instructions: MCP_INSTRUCTIONS,
        allRoutes: false, // a route is a tool only when it says `detail.mcp: true`
        headerParams: true, // so a tool call can send Idempotency-Key
        auth: { verify: (request) => isAuthenticated(request, ctx.auth) },
        headers: (incoming) => {
          // what reaches the route: the caller's credentials and the worker's run id
          const out = new Headers()
          for (const name of ['authorization', 'cookie', 'x-kammacron-run', 'host']) {
            const value = incoming.get(name)
            if (value !== null) out.set(name, value)
          }
          return out
        },
      }),
    )
    .group('/api', (api) =>
      api
        .use(projectRoutes(ctx))
        .use(cardRoutes(ctx))
        .use(fileApiRoutes(ctx))
        .use(runRoutes(ctx))
        .use(systemRoutes(ctx)),
    )
    .use(fileRoutes(ctx))
    .use(staticRoutes(ctx.webDir)) // last: its `/*` must not shadow a route
  // the hub runs a subscribed route again through `app.handle`, with the stream's credentials
  bindLive(ctx.live, app)
  return app
}

export type App = ReturnType<typeof buildApp>

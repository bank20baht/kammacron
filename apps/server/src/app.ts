import { openapi } from '@elysiajs/openapi'
import { mcpify, verifyWithOAuthProvider } from '@20baht/elysia-openapi-mcp'
import { bindLive, livePlugin } from '@20baht/live/elysia'
import { Elysia } from 'elysia'

import { authGuard, isOwner, runScopeOf } from './auth'
import type { AppContext } from './context'
import { OAUTH_SCOPE } from './oauth'
import { sameSecret } from './secrets'
import { adminRoutes } from './routes/admin'
import { cardRoutes, CARD_RULES } from './routes/cards'
import { fileApiRoutes, fileRoutes } from './routes/files'
import { localSessionRoutes } from './routes/local-sessions'
import { projectRoutes } from './routes/projects'
import { runRoutes } from './routes/runs'
import { scheduleRoutes } from './routes/schedules'
import { statusRoutes } from './routes/status'
import { systemRoutes } from './routes/system'
import { workerRoutes } from './routes/worker'
import { staticRoutes } from './static'
import { ServiceError } from './services/errors'

const MCP_INSTRUCTIONS = `kammacron is a Kanban board with cron jobs: its "auto-pilot"-tagged cards are worked by unattended agents (the project's worker, and Claude or Codex on a schedule).
Cards are numbered (#12). Use list_projects for project ids, list_cards to find cards, get_card for one card in full.
${CARD_RULES}
Moving a card to review needs a reason. Nothing is ever deleted: archive_card instead.
To show an image (a screenshot of a bug), upload it with upload_image and put the markdown it returns in the card body or a comment.`

/**
 * How /mcp checks its caller. Without OAuth: the API token or the session (request mode). With it:
 * a resource server whose 401 tells MCP clients where to sign in, accepting the provider's tokens
 * and, as before, the API token (the worker and `claude mcp add` keep working).
 */
const mcpAuth = (ctx: AppContext) => {
  const oauth = ctx.oauth
  if (!oauth)
    return {
      verify: (request: Request) =>
        isOwner(request, ctx.auth) || runScopeOf(request, ctx.auth) !== undefined,
    }
  const viaProvider = verifyWithOAuthProvider(oauth.provider, oauth.issuer)
  return {
    resource: oauth.resource,
    authorizationServers: [oauth.issuer],
    scopes: [OAUTH_SCOPE],
    verify: (token: string, context: { request: Request }) =>
      sameSecret(token, ctx.auth.apiToken) || ctx.auth.runOf(token) !== undefined
        ? {
            iss: oauth.issuer,
            aud: oauth.resource,
            sub: 'owner',
            scope: OAUTH_SCOPE,
            exp: Math.floor(Date.now() / 1000) + 3600,
          }
        : viaProvider(token, context),
  }
}

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
    .use(ctx.oauth?.plugin ?? new Elysia({ name: 'kammacron-no-oauth' }))
    .use(
      openapi({
        // the spec only: the interactive page would run a CDN's script in the owner's origin
        provider: null,
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
        auth: mcpAuth(ctx),
        headers: (incoming) => {
          // what reaches the route: the caller's credentials (a worker's token names its run)
          const out = new Headers()
          for (const name of ['authorization', 'cookie', 'host']) {
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
        .use(workerRoutes(ctx))
        .use(statusRoutes(ctx))
        .use(scheduleRoutes(ctx))
        .use(localSessionRoutes(ctx))
        .use(adminRoutes(ctx))
        .use(systemRoutes(ctx)),
    )
    .use(fileRoutes(ctx))
    .use(staticRoutes(ctx.webDir)) // last: its `/*` must not shadow a route
  // the hub runs a subscribed route again through `app.handle`, with the stream's credentials
  bindLive(ctx.live, app)
  return app
}

export type App = ReturnType<typeof buildApp>

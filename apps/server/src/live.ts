import type { PGlite } from '@electric-sql/pglite'
import { createLive } from '@20baht/live'
import { pgSource, pgliteListener } from '@20baht/live/pg'

import { isAuthenticated, type AuthState } from './auth'

/** The one person of an install: a stream is theirs when it carries the token or the session. */
export type Owner = { id: 'owner' }

/**
 * The live hub: LISTENs on PGlite, where the triggers of `openDatabase` notify on commit, and
 * runs a subscribed route again whenever one of its topics changes.
 */
export const createLiveHub = (client: PGlite, auth: AuthState) =>
  createLive<Owner>({
    source: pgSource(pgliteListener(client)),
    caller: (headers) =>
      Promise.resolve(
        isAuthenticated(new Request('http://localhost/', { headers }), auth)
          ? { id: 'owner' as const }
          : null,
      ),
  })

export type LiveHub = ReturnType<typeof createLiveHub>

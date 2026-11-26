import { createLive } from '@20baht/live'
import { pgSource, type PgListener } from '@20baht/live/pg'

import { isOwner, type AuthState } from './auth'

/** The one person of an install: a stream is theirs when it carries the token or the session. */
export type Owner = { id: 'owner' }

/**
 * The live hub: LISTENs (PGlite or Postgres) where the triggers of `openDatabase` notify on commit, and
 * runs a subscribed route again whenever one of its topics changes.
 */
export const createLiveHub = (listener: PgListener, auth: AuthState) =>
  createLive<Owner>({
    source: pgSource(listener),
    caller: (headers) =>
      Promise.resolve(
        isOwner(new Request('http://localhost/', { headers }), auth)
          ? { id: 'owner' as const }
          : null,
      ),
  })

export type LiveHub = ReturnType<typeof createLiveHub>

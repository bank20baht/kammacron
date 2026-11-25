import type { AuthState } from './auth'
import type { Db } from './db'
import type { LiveHub } from './live'
import type { Secrets } from './secrets'

/** What every route module is built from. One per process (and one per test). */
export type AppContext = {
  db: Db
  live: LiveHub
  auth: AuthState
  secrets: Secrets
  secretsPath: string
  /** Where attachments are kept (`<data>/files`). */
  filesDir: string
  /** Did this request reach the server from this machine? (Not knowable in `app.handle` tests.) */
  isLoopback: (request: Request) => boolean
}

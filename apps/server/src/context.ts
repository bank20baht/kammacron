import type { AuthState } from './auth'
import type { Db } from './db'
import type { LiveHub } from './live'
import type { OAuth } from './oauth'
import type { Secrets } from './secrets'
import type { WorkerEnv } from './worker/env'
import type { Scheduler } from './worker/scheduler'

/** What every route module is built from. One per process (and one per test). */
export type AppContext = {
  db: Db
  live: LiveHub
  auth: AuthState
  secrets: Secrets
  secretsPath: string
  /** The built web app, served at `/`; null when there is none (tests, the API alone). */
  webDir: string | null
  /** Where attachments are kept (`<data>/files`). */
  filesDir: string
  /** Did this request reach the server from this machine? (Not knowable in `app.handle` tests.) */
  isLoopback: (request: Request) => boolean
  worker: WorkerEnv
  /** OAuth for /mcp, when `settings.public_url` is set (read at start). */
  oauth: OAuth | null
  /** The loop that runs the worker; null where the worker is off (tests, `--no-worker`). */
  scheduler: Scheduler | null
}

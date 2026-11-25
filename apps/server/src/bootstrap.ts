import { join } from 'node:path'

import type { AppContext } from './context'
import type { Database } from './db'
import { createLiveHub } from './live'
import { secretsPath } from './secrets'
import { ensureSecrets, getSettings } from './services/settings'
import type { WorkerEnv } from './worker/env'
import { notifier } from './worker/notify'
import { createScheduler } from './worker/scheduler'

export type ContextOptions = {
  database: Database
  dataDir: string
  isLoopback: (request: Request) => boolean
  /** Where the worker's MCP client reaches this server, known once it listens. */
  serverUrl: () => string
  claudeBin?: string | undefined
  /** false: no scheduler (tests drive runs themselves; `start --no-worker`). */
  worker?: boolean | undefined
  notify?: WorkerEnv['notify'] | undefined
  webDir?: string | null | undefined
}

/** Secrets, the live hub, the worker's environment and its scheduler: one per process. */
export const buildContext = async (options: ContextOptions): Promise<AppContext> => {
  const { database, dataDir } = options
  const path = secretsPath(dataDir)
  const secrets = await ensureSecrets(database.db, path)
  const settings = await getSettings(database.db)
  const auth = {
    apiToken: secrets.api_token,
    sessionSecret: secrets.session_secret,
    allowedHosts: settings.allowed_hosts,
  }
  const worker: WorkerEnv = {
    db: database.db,
    dataDir,
    serverUrl: options.serverUrl,
    apiToken: () => auth.apiToken,
    claudeToken: () => process.env['CLAUDE_CODE_OAUTH_TOKEN'] ?? secrets.claude_oauth_token,
    claudeBin: options.claudeBin ?? process.env['KAMMACRON_CLAUDE_BIN'] ?? 'claude',
    notify: options.notify ?? notifier(database.db),
    handles: new Map(),
  }
  return {
    db: database.db,
    live: createLiveHub(database.client, auth),
    auth,
    secrets,
    secretsPath: path,
    filesDir: join(dataDir, 'files'),
    webDir: options.webDir ?? null,
    isLoopback: options.isLoopback,
    worker,
    scheduler: options.worker === false ? null : createScheduler(worker),
  }
}

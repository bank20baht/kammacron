import { join } from 'node:path'

import type { AppContext } from './context'
import type { Database } from './db'
import { isOwner, type AuthState, type RunScope } from './auth'
import { createLiveHub } from './live'
import { createOAuth } from './oauth'
import { secretsPath } from './secrets'
import { ensureSecrets, getSettings } from './services/settings'
import type { WorkerEnv } from './worker/env'
import { notifier } from './worker/notify'
import { createScheduler } from './worker/scheduler'

export type ContextOptions = {
  database: Database
  dataDir: string
  /** The bound address, when it is not a local name. */
  bindHost?: string | undefined
  /** Where the worker's MCP client reaches this server, known once it listens. */
  serverUrl: () => string
  claudeBin?: string | undefined
  /** The `codex` executable; else KAMMACRON_CODEX_BIN, else `codex` on PATH. */
  codexBin?: string | undefined
  /** false: no scheduler (tests drive runs themselves; `start --no-worker`). */
  worker?: boolean | undefined
  notify?: WorkerEnv['notify'] | undefined
  webDir?: string | null | undefined
  /** OAuth's issuer; else KAMMACRON_PUBLIC_URL, else `settings.public_url`. */
  publicUrl?: string | undefined
}

/** Secrets, the live hub, the worker's environment and its scheduler: one per process. */
export const buildContext = async (options: ContextOptions): Promise<AppContext> => {
  const { database, dataDir } = options
  const path = secretsPath(dataDir)
  const secrets = await ensureSecrets(database.db, path)
  const settings = await getSettings(database.db)
  const runTokens = new Map<string, RunScope>()
  const auth: AuthState = {
    apiToken: secrets.api_token,
    sessionSecret: secrets.session_secret,
    allowedHosts: settings.allowed_hosts,
    bindHost: options.bindHost,
    runOf: (token) => runTokens.get(token),
    loginCodes: new Map(),
  }
  const publicUrl = options.publicUrl ?? process.env['KAMMACRON_PUBLIC_URL'] ?? settings.public_url
  const oauth = publicUrl
    ? createOAuth(database.db, publicUrl, (request) => isOwner(request, auth))
    : null
  if (oauth) {
    auth.publicHost = new URL(oauth.issuer).hostname
    auth.verifyOAuth = oauth.verify
  }
  const worker: WorkerEnv = {
    db: database.db,
    dataDir,
    serverUrl: options.serverUrl,
    apiToken: () => auth.apiToken,
    claudeBin: options.claudeBin ?? process.env['KAMMACRON_CLAUDE_BIN'] ?? 'claude',
    codexBin: options.codexBin ?? process.env['KAMMACRON_CODEX_BIN'] ?? 'codex',
    notify: options.notify ?? notifier(database.db),
    handles: new Map(),
    runTokens,
    claude: { hold: null, told: false },
  }
  return {
    db: database.db,
    live: createLiveHub(database.listener, auth),
    auth,
    secrets,
    secretsPath: path,
    filesDir: join(dataDir, 'files'),
    webDir: options.webDir ?? null,
    worker,
    scheduler: options.worker === false ? null : createScheduler(worker),
    oauth,
  }
}

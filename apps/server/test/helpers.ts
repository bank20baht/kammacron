import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp } from '../src/app'
import type { AppContext } from '../src/context'
import { openDatabase, type Database } from '../src/db'
import { createLiveHub } from '../src/live'
import { secretsPath } from '../src/secrets'
import { ensureSecrets, getSettings } from '../src/services/settings'

export type TestApp = {
  ctx: AppContext
  database: Database
  app: ReturnType<typeof buildApp>
  /** A request with the API token, as JSON. */
  call: (
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => Promise<Response>
  json: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>
  close: () => Promise<void>
}

export const testApp = async (options: { loopback?: boolean } = {}): Promise<TestApp> => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kammacron-test-'))
  const database = await openDatabase()
  const path = secretsPath(dataDir)
  const secrets = await ensureSecrets(database.db, path)
  const row = await getSettings(database.db)
  const auth = {
    apiToken: secrets.api_token,
    sessionSecret: secrets.session_secret,
    allowedHosts: row.allowed_hosts,
  }
  const ctx: AppContext = {
    db: database.db,
    live: createLiveHub(database.client, auth),
    auth,
    secrets,
    secretsPath: path,
    filesDir: join(dataDir, 'files'),
    isLoopback: () => options.loopback ?? true,
  }
  const app = buildApp(ctx)
  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          authorization: `Bearer ${ctx.auth.apiToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  const json = async <T>(method: string, path: string, body?: unknown) => {
    const response = await call(method, path, body)
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path} → ${String(response.status)} ${text}`)
    return JSON.parse(text) as T
  }
  return {
    ctx,
    database,
    app,
    call,
    json,
    close: async () => {
      ctx.live.close()
      await database.close()
      await rm(dataDir, { recursive: true, force: true })
    },
  }
}

/** The value, or a failed test: in place of `!`, which the lint forbids. */
export const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) throw new Error(`expected a ${what}`)
  return value
}

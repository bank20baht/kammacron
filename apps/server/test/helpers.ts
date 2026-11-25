import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp } from '../src/app'
import { buildContext } from '../src/bootstrap'
import type { AppContext } from '../src/context'
import { openDatabase, type Database } from '../src/db'

export type TestApp = {
  ctx: AppContext
  dataDir: string
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

export const testApp = async (
  options: { loopback?: boolean; claudeBin?: string; serverUrl?: () => string } = {},
): Promise<TestApp> => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kammacron-test-'))
  const database = await openDatabase()
  const ctx = await buildContext({
    database,
    dataDir,
    worker: false,
    serverUrl: () => options.serverUrl?.() ?? 'http://127.0.0.1:0',
    isLoopback: () => options.loopback ?? true,
    claudeBin: options.claudeBin,
    notify: () => Promise.resolve(),
  })
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
    dataDir,
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

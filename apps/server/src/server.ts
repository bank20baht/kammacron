import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildApp } from './app'
import { buildContext } from './bootstrap'
import { openDatabase, openPostgres } from './db'

export type ServerOptions = {
  host?: string | undefined
  port?: number | undefined
  dataDir?: string | undefined
  /** false: serve the board and MCP only, run no worker. */
  worker?: boolean | undefined
  /** Postgres instead of PGlite (else DATABASE_URL, else PGlite in the data dir). */
  databaseUrl?: string | undefined
  /** The built web app; found beside the bundle (`./web`) or in `apps/web/dist` when omitted. */
  webDir?: string | undefined
}

export const DEFAULT_PORT = 7420

export const resolveDataDir = (dataDir?: string) =>
  dataDir ?? process.env['KAMMACRON_DATA_DIR'] ?? join(homedir(), '.kammacron')

/** `<data>/server.json`: who holds the data dir, so a second process (and the CLI) can tell. */
export type ServerLock = {
  pid: number
  host: string
  port: number
  started_at: string
}

const lockPath = (dataDir: string) => join(dataDir, 'server.json')

/** The web app: as given, then `web/` beside this file (the npm package), then the dev build. */
const findWebDir = async (given?: string) => {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    given,
    process.env['KAMMACRON_WEB_DIR'],
    join(here, 'web'),
    join(here, '..', '..', 'web', 'dist', 'web', 'browser'),
  ]
  for (const dir of candidates)
    if (dir && (await Bun.file(join(dir, 'index.html')).exists())) return dir
  return null
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Where this machine's own clients reach a server bound to `host`: never an address it does not
 * hold, or whoever does would be sent the token.
 */
export const clientHost = (host: string) => {
  if (host === '0.0.0.0') return '127.0.0.1'
  if (host === '::' || host === '::1' || host === '[::1]') return '[::1]'
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}

export const readLock = async (dataDir: string): Promise<ServerLock | null> => {
  try {
    const lock = JSON.parse(await readFile(lockPath(dataDir), 'utf8')) as ServerLock
    return isAlive(lock.pid) ? lock : null
  } catch {
    return null
  }
}

/**
 * Opens the data dir (PGlite allows one process per dir), migrates, and listens.
 * Binds 127.0.0.1 unless told otherwise: a tunnel is the way in from elsewhere.
 */
export const startServer = async (options: ServerOptions = {}) => {
  const dataDir = resolveDataDir(options.dataDir)
  const host = options.host ?? process.env['KAMMACRON_HOST'] ?? '127.0.0.1'
  const port =
    options.port ?? Number(process.env['KAMMACRON_PORT'] ?? process.env['PORT'] ?? DEFAULT_PORT)

  await mkdir(dataDir, { recursive: true, mode: 0o700 })
  // one made wider (an older compiled binary, by hand) is closed: PGlite's files rely on it
  await chmod(dataDir, 0o700)
  // a process that was just told to stop may still be closing the database: give it a moment
  let held = await readLock(dataDir)
  for (let waited = 0; held && waited < 15_000; waited += 250) {
    await Bun.sleep(250)
    held = await readLock(dataDir)
  }
  if (held)
    throw new Error(
      `${dataDir} is in use by kammacron pid ${String(held.pid)} on port ${String(held.port)}`,
    )

  // DATABASE_URL: Postgres; otherwise PGlite in the data dir
  const url = options.databaseUrl ?? process.env['DATABASE_URL']
  const database = url ? await openPostgres(url) : await openDatabase(join(dataDir, 'db'))
  const listening: { port?: number } = {} // filled once listening
  const ctx = await buildContext({
    database,
    dataDir,
    worker: options.worker,
    webDir: await findWebDir(options.webDir),
    serverUrl: () => `http://${clientHost(host)}:${String(listening.port ?? port)}`,
    bindHost: new URL(`http://${clientHost(host)}`).hostname,
  })

  // the largest honest request is a 10 MB image as base64; anyone can send a body
  const app = buildApp(ctx).listen({
    hostname: host,
    port,
    maxRequestBodySize: 20 * 1024 * 1024,
  })
  const actualPort = app.server?.port ?? port
  listening.port = actualPort
  await ctx.scheduler?.start()
  const lock: ServerLock = {
    pid: process.pid,
    host,
    port: actualPort,
    started_at: new Date().toISOString(),
  }
  await writeFile(lockPath(dataDir), JSON.stringify(lock), { mode: 0o600 })

  return {
    ctx,
    url: `http://${clientHost(host)}:${String(actualPort)}`,
    /**
     * In order, each step guarded so one failing cannot keep the rest (and the lock) from going:
     * runs stop, then HTTP with its open live streams, then the hub, then the database.
     */
    stop: async () => {
      const quietly = async (step: () => unknown) => {
        try {
          await step()
        } catch {
          // shutting down: nothing left to tell
        }
      }
      await quietly(() => ctx.scheduler?.stop())
      await quietly(() => app.stop(true))
      await quietly(() => {
        ctx.live.close()
      })
      await Bun.sleep(100) // a live run that was mid-query sees the hub closed before the DB goes
      await quietly(() => database.close())
      await rm(lockPath(dataDir), { force: true })
    },
  }
}

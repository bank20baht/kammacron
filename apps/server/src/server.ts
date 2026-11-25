import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { buildApp } from './app'
import type { AppContext } from './context'
import { openDatabase } from './db'
import { secretsPath } from './secrets'
import { ensureSecrets, getSettings } from './services/settings'

export type ServerOptions = {
  host?: string | undefined
  port?: number | undefined
  dataDir?: string | undefined
}

const DEFAULT_PORT = 7420

const resolveDataDir = (dataDir?: string) =>
  dataDir ?? process.env['KAMMACRON_DATA_DIR'] ?? join(homedir(), '.kammacron')

/** `<data>/server.json`: who holds the data dir, so a second process (and the CLI) can tell. */
export type ServerLock = {
  pid: number
  host: string
  port: number
  started_at: string
}

const lockPath = (dataDir: string) => join(dataDir, 'server.json')

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const readLock = async (dataDir: string): Promise<ServerLock | null> => {
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
  const held = await readLock(dataDir)
  if (held)
    throw new Error(
      `${dataDir} is in use by kammacron pid ${String(held.pid)} on port ${String(held.port)}`,
    )

  const database = await openDatabase(join(dataDir, 'db'))
  const path = secretsPath(dataDir)
  const secrets = await ensureSecrets(database.db, path)
  const settings = await getSettings(database.db)

  // filled once listening: `isLoopback` asks the Bun server for the peer address
  const listening: { server?: { requestIP: (r: Request) => { address: string } | null } } = {}
  const ctx: AppContext = {
    db: database.db,
    auth: {
      apiToken: secrets.api_token,
      sessionSecret: secrets.session_secret,
      allowedHosts: settings.allowed_hosts,
    },
    secrets,
    secretsPath: path,
    filesDir: join(dataDir, 'files'),
    isLoopback: (request) => {
      const ip = listening.server?.requestIP(request)?.address
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
    },
  }

  const app = buildApp(ctx).listen({ hostname: host, port })
  if (app.server) listening.server = app.server
  const actualPort = app.server?.port ?? port
  const lock: ServerLock = {
    pid: process.pid,
    host,
    port: actualPort,
    started_at: new Date().toISOString(),
  }
  await writeFile(lockPath(dataDir), JSON.stringify(lock), { mode: 0o600 })

  return {
    ctx,
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${String(actualPort)}`,
    stop: async () => {
      await app.stop()
      await database.close()
      await rm(lockPath(dataDir), { force: true })
    },
  }
}

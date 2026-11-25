#!/usr/bin/env bun
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { readSecrets, secretsPath } from './secrets'
import { DEFAULT_PORT, readLock, resolveDataDir, startServer } from './server'
import { installService, uninstallService } from './service'
import { exec } from './worker/git'

const HELP = `kammacron: Kanban + MCP + a Claude worker, on this machine

Usage: kammacron <command> [options]

  start               run in the foreground (--port ${String(DEFAULT_PORT)}, --host 127.0.0.1, --data-dir ~/.kammacron, --no-worker)
  open                open the web app in the browser
  status              is it running, on which port, paused or not, the run going
  pause | resume      stop or restart the worker everywhere (emergency stop)
  token               the \`claude mcp add\` command, with the token
  install-service     run it in the background at login (launchd on macOS, systemd --user on Linux)
  uninstall-service   remove that service
  update              install the latest kammacron and restart the service
  version             the installed version
`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    port: { type: 'string' },
    host: { type: 'string' },
    'data-dir': { type: 'string' },
    'no-worker': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
})
const command = positionals[0] ?? (values.help ? 'help' : 'help')
const dataDir = resolveDataDir(values['data-dir'])

const die = (message: string): never => {
  console.error(message)
  process.exit(1)
}

/** The running server's base URL and token, or a message saying how to start it. */
const running = async () => {
  const lock = await readLock(dataDir)
  if (!lock)
    return die(
      `kammacron is not running (data dir ${dataDir}). Start it: kammacron start, or kammacron install-service`,
    )
  const secrets = await readSecrets(secretsPath(dataDir))
  if (!secrets) return die(`no ${secretsPath(dataDir)}`)
  const host = lock.host === '0.0.0.0' ? '127.0.0.1' : lock.host
  return { url: `http://${host}:${String(lock.port)}`, token: secrets.api_token, lock }
}

const api = async (method: string, path: string, body?: unknown) => {
  const { url, token } = await running()
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) die(`${method} ${path}: ${String(response.status)} ${await response.text()}`)
  return response.json() as Promise<unknown>
}

const version = async () => {
  // the npm package keeps package.json beside the bundle
  const pkg = Bun.file(join(import.meta.dir, 'package.json'))
  if (await pkg.exists()) return ((await pkg.json()) as { version?: string }).version ?? '0.0.0'
  return '0.0.0-dev'
}

const which = async (name: string) => {
  const r = await exec(['sh', '-c', `command -v ${name}`], { cwd: '/' })
  return r.code === 0 ? r.stdout.trim() : null
}

switch (command) {
  case 'start': {
    const port = values.port ? Number(values.port) : undefined
    if (port !== undefined && !Number.isInteger(port))
      die(`--port must be a number, not ${values.port ?? ''}`)
    const handle = await startServer({
      port,
      host: values.host,
      dataDir,
      worker: !values['no-worker'],
    }).catch((error: unknown) => die(error instanceof Error ? error.message : String(error)))
    console.log(`kammacron ${await version()} on ${handle.url} (data: ${dataDir})`)
    const stop = () => {
      void handle.stop().then(() => process.exit(0))
    }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
    break
  }
  case 'open': {
    const { url } = await running()
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer'
          : 'xdg-open'
    await exec([opener, url], { cwd: '/' })
    console.log(url)
    break
  }
  case 'status': {
    const lock = await readLock(dataDir)
    if (!lock) {
      console.log(`not running (data dir ${dataDir})`)
      process.exit(3)
    }
    const status = (await api('GET', '/api/status')) as {
      paused: boolean
      running: { run_id: number; card_id: number; card_title: string }[]
      review: number
      paused_projects: { name: string; reason: string }[]
    }
    console.log(
      `running: pid ${String(lock.pid)}, http://${lock.host}:${String(lock.port)}, since ${lock.started_at}`,
    )
    console.log(`worker: ${status.paused ? 'PAUSED' : 'on'}`)
    for (const r of status.running)
      console.log(`  run ${String(r.run_id)}: #${String(r.card_id)} ${r.card_title}`)
    for (const p of status.paused_projects) console.log(`  project ${p.name} paused: ${p.reason}`)
    console.log(`review: ${String(status.review)} card${status.review === 1 ? '' : 's'}`)
    break
  }
  case 'pause':
  case 'resume':
    await api('PATCH', '/api/settings', { paused: command === 'pause' })
    console.log(
      command === 'pause'
        ? 'paused: no new runs start (a run going now finishes; stop it in the web app)'
        : 'resumed',
    )
    break
  case 'token': {
    const { url, token } = await running()
    console.log(
      `claude mcp add --transport http kammacron ${url}/mcp --header "Authorization: Bearer ${token}"`,
    )
    break
  }
  case 'install-service': {
    const bun = realpathSync(process.execPath)
    const entry = realpathSync(Bun.main)
    if (/[/\\](\.bun[/\\]install[/\\]cache|bunx-)/.test(entry))
      die(
        'This copy runs from the bunx cache, which can be cleared. Install it first: bun add -g kammacron, then kammacron install-service',
      )
    const port = values.port ? Number(values.port) : DEFAULT_PORT
    const lines = await installService({
      bun,
      entry,
      dataDir,
      port,
      path: process.env['PATH'] ?? '',
    })
    for (const line of lines) console.log(line)
    const missing = []
    for (const tool of ['git', 'claude']) if (!(await which(tool))) missing.push(tool)
    if (missing.length)
      console.log(
        `warning: not on this PATH: ${missing.join(', ')}. The worker will not find them.`,
      )
    break
  }
  case 'uninstall-service':
    for (const line of await uninstallService()) console.log(line)
    break
  case 'update': {
    const r = await exec(['bun', 'add', '-g', 'kammacron@latest'], { cwd: '/' })
    if (r.code !== 0) die(r.stderr)
    console.log(r.stdout.trim())
    console.log('Run `kammacron install-service` again to restart the service on the new version.')
    break
  }
  case 'version':
    console.log(await version())
    break
  default:
    console.log(HELP)
}

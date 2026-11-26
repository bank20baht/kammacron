#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// the flags keep the current folder's .env and bunfig.toml out: they could run code as the owner
import { realpathSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { identityProof } from './auth'
import { banner } from './banner'
import { newToken, readSecrets, sameSecret, secretsPath } from './secrets'
import { clientHost, DEFAULT_PORT, readLock, resolveDataDir, startServer } from './server'
import { installService, uninstallService } from './service'
import { exec } from './worker/git'

const HELP = `kammacron: a scheduler with a board, on this machine

Usage: kammacron <command> [options]

  start               run in the foreground (--port ${String(DEFAULT_PORT)}, --host 127.0.0.1, --data-dir ~/.kammacron, --no-worker)
  open                open the web app in the browser, signed in
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
  const url = `http://${clientHost(lock.host)}:${String(lock.port)}`
  return { url, token: secrets.api_token, lock }
}

/**
 * A lock left by a dead server may point at a port someone else now holds: the listener must prove
 * it knows the token before it is sent one.
 */
const verified = async () => {
  const target = await running()
  const nonce = newToken()
  const proof = await fetch(`${target.url}/api/identity?nonce=${nonce}`)
    .then(async (r) => ((await r.json()) as { proof?: string }).proof)
    .catch(() => undefined)
  if (!proof || !sameSecret(proof, identityProof(target.token, nonce)))
    die(
      `what answers at ${target.url} is not this kammacron; the token was not sent. Is it running?`,
    )
  return target
}

const api = async (method: string, path: string, body?: unknown) => {
  const { url, token } = await verified()
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
  const given = process.env['KAMMACRON_VERSION'] // the compiled binary
  if (given) return given
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
    const v = await version()
    const top = banner(v)
    if (top) console.log(top)
    console.log(`kammacron ${v} on ${handle.url} (data: ${dataDir})`)
    const stop = () => {
      // exit however stopping ends, and within 10 s even if something hangs
      setTimeout(() => process.exit(1), 10_000).unref()
      void handle.stop().finally(() => process.exit(0))
    }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
    break
  }
  case 'open': {
    const { url } = await running()
    const { code } = (await api('POST', '/api/session/code')) as { code: string }
    // through a private file, not the opener's arguments, which other accounts can list
    const file = join(dataDir, 'open.html')
    const target = JSON.stringify(`${url}/login#code=${code}`)
    await writeFile(
      file,
      `<!doctype html><title>kammacron</title><script>location.replace(${target})</script>\n`,
      { mode: 0o600 },
    )
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer'
          : 'xdg-open'
    await exec([opener, file], { cwd: '/' })
    console.log(`${url} (not signed in? run \`kammacron token\` and paste the token)`)
    await Bun.sleep(5000) // the browser reads the file in its own time
    await rm(file, { force: true })
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
      running: {
        run_id: number
        card_id: number | null
        card_title: string | null
        schedule_name: string | null
      }[]
      review: number
      paused_projects: { name: string; reason: string }[]
    }
    console.log(
      `running: pid ${String(lock.pid)}, http://${lock.host}:${String(lock.port)}, since ${lock.started_at}`,
    )
    console.log(`worker: ${status.paused ? 'PAUSED' : 'on'}`)
    for (const r of status.running)
      console.log(
        `  run ${String(r.run_id)}: ${r.card_id === null ? `schedule ${r.schedule_name ?? ''}` : `#${String(r.card_id)} ${r.card_title ?? ''}`}`,
      )
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
    // the compiled binary is its own entry; Bun.main then sits in Bun's embedded filesystem
    const compiled = Bun.main.startsWith('/$bunfs/') || Bun.main.startsWith('B:\\~BUN\\')
    const entry = compiled ? null : realpathSync(Bun.main)
    if (entry !== null && /[/\\](\.bun[/\\]install[/\\]cache|bunx-)/.test(entry))
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
  default: {
    const top = banner(await version())
    if (top) console.log(top)
    console.log(HELP)
  }
}

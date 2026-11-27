import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { localSessions, stopProcess } from '../src/services/local-sessions'
import { exec } from '../src/worker/git'
import { must, testApp, type TestApp } from './helpers'

// Claude Code's and Codex's files, written as they write them, in folders of the test's own: the
// machine's real sessions are never read here, and never stopped.
let root: string
let claude: string
let codex: string
const children: { kill: () => void }[] = []

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kammacron-sessions-'))
  claude = join(root, 'claude')
  codex = join(root, 'codex')
  process.env['CLAUDE_CONFIG_DIR'] = claude
  process.env['CODEX_HOME'] = codex
})
afterAll(async () => {
  delete process.env['CLAUDE_CONFIG_DIR']
  delete process.env['CODEX_HOME']
  await rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  await rm(claude, { recursive: true, force: true })
  await rm(codex, { recursive: true, force: true })
  await mkdir(join(claude, 'sessions'), { recursive: true })
  await mkdir(join(claude, 'projects', '-work-demo'), { recursive: true })
})
afterEach(() => {
  for (const child of children.splice(0)) child.kill()
})

/** A process standing in for a session, with what its environment should say. */
const sleeper = (env: Record<string, string> = {}) => {
  // bun, not `sleep`: macOS shows no environment of its own system binaries, even to their user
  const proc = Bun.spawn([process.execPath, '-e', 'setTimeout(() => {}, 60_000)'], {
    env: { PATH: process.env['PATH'] ?? '', ...env },
  })
  children.push(proc)
  return proc.pid
}

/** When the process started, in UTC, as Claude Code writes `procStart`. */
const procStart = async (pid: number) =>
  (
    await exec(['ps', '-o', 'lstart=', '-p', String(pid)], {
      cwd: '/',
      env: { ...process.env, TZ: 'UTC' },
    })
  ).stdout.trim()

const minutesAgo = (m: number) => Date.now() - m * 60_000

const claudeSession = async (
  pid: number,
  fields: { id: string; status: string; since?: number; procStart?: string },
) => {
  await writeFile(
    join(claude, 'sessions', `${String(pid)}.json`),
    JSON.stringify({
      pid,
      sessionId: fields.id,
      cwd: '/work/demo',
      startedAt: minutesAgo(90),
      procStart: fields.procStart ?? (await procStart(pid)),
      kind: 'interactive',
      name: `demo-${fields.id}`,
      status: fields.status,
      statusUpdatedAt: fields.since ?? minutesAgo(1),
    }),
  )
}

/** An answer of Claude's, as a transcript line; written in parts, a message repeats its usage. */
const answer = (id: string, at: number, output: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: new Date(at).toISOString(),
    message: {
      id,
      model: 'claude-opus-5-5',
      usage: {
        input_tokens: 10,
        output_tokens: output,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 100,
      },
    },
  })

const transcript = (id: string, lines: string[]) =>
  writeFile(join(claude, 'projects', '-work-demo', `${id}.jsonl`), `${lines.join('\n')}\n`)

const mine = async () => (await localSessions()).filter((s) => !s.id.startsWith('process-'))

describe('the Claude Code sessions on this machine', () => {
  test('a working session: its status, model, and the tokens of the last 5 minutes and hour', async () => {
    const pid = sleeper()
    await claudeSession(pid, { id: 'aaa', status: 'busy' })
    await transcript('aaa', [
      answer('m1', minutesAgo(40), 500),
      answer('m2', minutesAgo(2), 300),
      answer('m2', minutesAgo(2), 300), // the same message, a second part
      answer('m3', minutesAgo(1), 200),
    ])
    const [s] = await mine()
    expect(s?.agent).toBe('claude')
    expect(s?.pid).toBe(pid)
    expect(s?.status).toBe('working')
    expect(s?.model).toBe('claude-opus-5-5')
    expect(s?.billing).toBe('subscription')
    expect(s?.tokens_5m).toEqual({ input: 20, output: 500, cache_read: 2000, cache_write: 200 })
    expect(s?.tokens_1h.output).toBe(1000)
    expect(s?.quiet).toBe(false)
    expect(s?.stoppable).toBe(true)
  })

  test('says how each pays: an API key in its environment, a cloud provider, else the plan', async () => {
    const keyed = sleeper({ ANTHROPIC_API_KEY: 'sk-test' })
    const bedrock = sleeper({ CLAUDE_CODE_USE_BEDROCK: '1' })
    const plan = sleeper()
    await claudeSession(keyed, { id: 'key', status: 'idle' })
    await claudeSession(bedrock, { id: 'aws', status: 'idle' })
    await claudeSession(plan, { id: 'plan', status: 'idle' })
    const billing = Object.fromEntries((await mine()).map((s) => [s.id, s.billing]))
    expect(billing).toEqual({ key: 'api', aws: 'cloud', plan: 'subscription' })
  })

  test('leaves out a file whose process is gone, or whose pid now belongs to another program', async () => {
    const gone = Bun.spawn(['true'])
    await gone.exited
    await claudeSession(gone.pid, {
      id: 'gone',
      status: 'busy',
      procStart: 'Thu Jan 1 00:00:00 2026',
    })
    const reused = sleeper()
    await claudeSession(reused, {
      id: 'reused',
      status: 'busy',
      procStart: 'Thu Jan 1 00:00:00 2026',
    })
    expect(await mine()).toEqual([])
  })

  test('marks a session working or in a command with nothing written for 15 minutes as quiet', async () => {
    const stuck = sleeper()
    await claudeSession(stuck, { id: 'stuck', status: 'shell', since: minutesAgo(40) })
    await transcript('stuck', [answer('m1', minutesAgo(40), 10)])
    const fresh = sleeper()
    await claudeSession(fresh, { id: 'fresh', status: 'shell', since: minutesAgo(40) })
    await transcript('fresh', [answer('m1', minutesAgo(1), 10)])
    const quiet = Object.fromEntries((await mine()).map((s) => [s.id, [s.status, s.quiet]]))
    expect(quiet).toEqual({ stuck: ['shell', true], fresh: ['shell', false] })
  })

  test('working ones come first', async () => {
    for (const [id, status] of [
      ['a', 'idle'],
      ['b', 'busy'],
      ['c', 'shell'],
    ] as const)
      await claudeSession(sleeper(), { id, status })
    expect((await mine()).map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('the Codex sessions on this machine', () => {
  const rollout = async (id: string, lines: object[]) => {
    const day = join(codex, 'sessions', '2026', '11', '28')
    await mkdir(day, { recursive: true })
    const head = {
      type: 'session_meta',
      payload: { id, cwd: '/work/codex', timestamp: new Date(minutesAgo(30)).toISOString() },
    }
    await writeFile(
      join(day, `rollout-${id}.jsonl`),
      `${[head, ...lines].map((l) => JSON.stringify(l)).join('\n')}\n`,
    )
  }
  const event = (at: number, payload: object) => ({
    type: 'event_msg',
    timestamp: new Date(at).toISOString(),
    payload,
  })
  const tokens = (at: number, output: number) =>
    event(at, {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 1000,
          cached_input_tokens: 800,
          output_tokens: output,
          reasoning_output_tokens: 50,
        },
      },
    })

  test("a turn going is working, with its tokens, and the sign-in's plan", async () => {
    await mkdir(codex, { recursive: true })
    await writeFile(join(codex, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt' }))
    await rollout('going', [
      {
        type: 'turn_context',
        timestamp: new Date(minutesAgo(3)).toISOString(),
        payload: { model: 'gpt-6.1' },
      },
      event(minutesAgo(3), { type: 'task_started' }),
      tokens(minutesAgo(2), 100),
    ])
    await rollout('done', [
      event(minutesAgo(20), { type: 'task_started' }),
      tokens(minutesAgo(19), 100),
      event(minutesAgo(19), { type: 'task_complete' }),
    ])
    const sessions = (await mine()).filter((s) => s.agent === 'codex')
    // a finished conversation with no codex of its own open is not on the list
    expect(sessions.map((s) => s.id)).toEqual(['going'])
    const [s] = sessions
    expect(s?.status).toBe('working')
    expect(s?.model).toBe('gpt-6.1')
    expect(s?.billing).toBe('subscription')
    expect(s?.tokens_5m).toEqual({ input: 200, output: 150, cache_read: 800, cache_write: 0 })
    // the desktop app's threads have no process of their own to end
    expect(s?.stoppable).toBe(false)
  })
})

describe('stopping a session', () => {
  test('counts a process that exited but is not yet waited for (a zombie) as stopped', async () => {
    // a shell that starts a child and never waits for it: the child, once killed, stays a zombie
    const parent = Bun.spawn(['sh', '-c', 'sleep 60 & echo $!; exec sleep 60'], { stdout: 'pipe' })
    children.push(parent)
    const first = await parent.stdout.getReader().read()
    const child = Number(new TextDecoder().decode(first.value).trim())
    expect(child).toBeGreaterThan(0)
    expect(await stopProcess(child)).toBe(true)
  })

  test('ends the process, and says so', async () => {
    const pid = sleeper()
    expect(await stopProcess(pid)).toBe(true)
    const left = await exec(['ps', '-o', 'pid=', '-p', String(pid)], { cwd: '/' })
    expect(left.stdout.trim()).toBe('')
  })
})

describe('the routes', () => {
  let t: TestApp
  beforeEach(async () => {
    t = await testApp()
  })
  afterEach(() => t.close())

  test('list, stop one, and stop the working ones: idle ones are left alone', async () => {
    const one = sleeper()
    const working = sleeper()
    const idle = sleeper()
    await claudeSession(one, { id: 'one', status: 'busy' })
    await claudeSession(working, { id: 'working', status: 'shell' })
    await claudeSession(idle, { id: 'idle', status: 'idle' })
    type Row = { id: string; status: string }
    const ids = async () =>
      (await t.json<Row[]>('GET', '/api/local-sessions'))
        .filter((s) => !s.id.startsWith('process-'))
        .map((s) => s.id)
    expect(await ids()).toEqual(['one', 'working', 'idle'])

    const stopped = await t.json<{ stopped: boolean }>('POST', '/api/local-sessions/stop', {
      agent: 'claude',
      id: 'one',
    })
    expect(stopped.stopped).toBe(true)
    expect(await ids()).toEqual(['working', 'idle'])

    const all = await t.json<{ stopped: string[]; left: string[] }>(
      'POST',
      '/api/local-sessions/stop-working',
    )
    expect(all.stopped).toEqual(['working'])
    expect(await ids()).toEqual(['idle'])
  })

  test('refuses a session that is not on the list: no pid of any other process is signalled', async () => {
    const response = await t.call('POST', '/api/local-sessions/stop', {
      agent: 'claude',
      id: 'nope',
    })
    expect(response.status).toBe(404)
  })

  test('are not MCP tools: an agent cannot list or end the sessions', async () => {
    const response = await t.call(
      'POST',
      '/mcp',
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    )
    const body = (await response.json()) as { result?: { tools?: { name: string }[] } }
    const names = must(body.result?.tools).map((tool) => tool.name)
    expect(names.some((name) => name.includes('local_session'))).toBe(false)
  })
})

import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'

import { newLoginCode, useLoginCode } from '../src/auth'
import { banner, bannerText } from '../src/banner'
import { launchdPlist, systemdUnit } from '../src/service'
import { linkedIds, sniffImage } from '../src/services/attachments'
import { staticRoutes } from '../src/static'
import type { Project } from '../src/services/projects'
import { classify, eventsOf, redact, spawnJsonLines } from '../src/worker/claude'
import { checkDir, exec, gitIn, localGit } from '../src/worker/git'
import { toolLists } from '../src/worker/runner'

const project = (patch: Partial<Project> = {}) =>
  ({
    allowed_bash: ['Bash(bun test:*)'],
    web_tools: false,
    ...patch,
  }) as Project

describe('toolLists', () => {
  test('git as the project decides (push included), what loses work denied, MCP and allowed_bash', () => {
    const { allowed, denied } = toolLists(project(), { kind: 'claude', name: 'Claude' }, ['zvec'])
    expect(allowed).toContain('Edit(./**)')
    expect(allowed).toContain('Grep(./**)')
    for (const bare of ['Read', 'Edit', 'Write', 'Glob', 'Grep'])
      expect(allowed).not.toContain(bare)
    expect(denied).toContain('Bash(git rebase -fx*)')
    expect(allowed).toContain('Bash(git push:*)')
    expect(allowed).toContain('Bash(git worktree:*)')
    expect(allowed).toContain('mcp__kammacron')
    expect(allowed).toContain('mcp__zvec')
    expect(allowed).toContain('Bash(bun test:*)')
    for (const tool of [
      'Bash(git push --force:*)',
      'Bash(git push origin +:*)',
      'Bash(git commit --no-verify:*)',
      'Bash(git reset --hard:*)',
      'Bash(git -c:*)',
    ])
      expect(denied).toContain(tool)
    expect(allowed).not.toContain('WebFetch')
  })

  test("a step's own allow list adds to the project's; web tools only when on", () => {
    const { allowed } = toolLists(
      project({ web_tools: true }),
      { kind: 'claude', name: 'Deploy notes', allow: ['Bash(ssh app:*)'] },
      [],
    )
    expect(allowed).toContain('Bash(ssh app:*)')
    expect(allowed).toContain('Bash(bun test:*)')
    expect(allowed).toContain('WebSearch')
    expect(allowed).toContain('WebFetch')
  })
})

describe('stream-json', () => {
  test('an assistant line with text and a tool call becomes two events', () => {
    const events = eventsOf({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'looking' },
          { type: 'tool_use', name: 'Bash', input: { command: 'bun test' } },
        ],
      },
    })
    expect(events.map((e) => [e.type, e.summary])).toEqual([
      ['assistant', 'looking'],
      ['tool_use', 'Bash bun test'],
    ])
  })

  test("an init line keeps nothing of the person's setup", () => {
    const line = {
      type: 'system',
      subtype: 'init',
      session_id: 's1',
      model: 'haiku',
      plugins: [{ path: '/Users/someone/.claude/plugins/x' }],
      skills: ['private-skill'],
      cwd: '/Users/someone/work',
    }
    expect(eventsOf(line)).toEqual([
      {
        type: 'system',
        summary: 'init',
        data: { subtype: 'init', session_id: 's1', model: 'haiku' },
      },
    ])
  })

  test('data past 8 KB is cut, and summaries stay short', () => {
    const [event] = eventsOf({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'x'.repeat(20_000) }] },
    })
    expect(event?.summary.length).toBeLessThanOrEqual(300)
    expect(JSON.stringify(event?.data).length).toBeLessThan(9000)
  })

  test('classify: auth (spike S5), rate limit, max turns, a clean end', () => {
    expect(
      classify({ result: { api_error_status: 401, is_error: true }, errors: [] }, 1, false),
    ).toBe('auth')
    expect(
      classify(
        { result: { is_error: true, result: 'x' }, errors: ['authentication_failed'] },
        1,
        false,
      ),
    ).toBe('auth')
    expect(
      classify({ result: { api_error_status: 429, is_error: true }, errors: [] }, 1, false),
    ).toBe('rate_limit')
    expect(
      classify(
        { result: { is_error: true, result: "You've hit your usage limit" }, errors: [] },
        1,
        false,
      ),
    ).toBe('rate_limit')
    expect(
      classify({ result: { subtype: 'error_max_turns', is_error: true }, errors: [] }, 1, false),
    ).toBe('max_turns')
    expect(
      classify({ result: { subtype: 'success', is_error: false }, errors: [] }, 0, false),
    ).toBeNull()
    expect(classify({ result: null, errors: [] }, 0, true)).toBe('stopped')
    expect(classify({ result: null, errors: [] }, 137, false)).toBe('crash')
  })

  test("classify: a clean end's summary is the work, not Claude's trouble", () => {
    const clean = (result: string) =>
      classify({ result: { subtype: 'success', is_error: false, result }, errors: [] }, 0, false)
    expect(clean('Added rate limiting to the login route; tests pass.')).toBeNull()
    expect(clean('The disk quota check now handles zero.')).toBeNull()
    expect(clean('The form now shows "Invalid API key" on a 401.')).toBeNull()
    // the same words on a run that failed still say why
    expect(
      classify({ result: { is_error: true, result: 'Invalid API key' }, errors: [] }, 1, false),
    ).toBe('auth')
  })

  test('redact hides tokens wherever they appear', () => {
    expect(redact('Bearer abcdefgh1234 and abcdefgh1234', ['abcdefgh1234'])).toBe(
      'Bearer [redacted] and [redacted]',
    )
  })
})

describe('attachments', () => {
  test('sniffs the four image types from their bytes, nothing else', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg')
    expect(sniffImage(new TextEncoder().encode('GIF89a'))?.mime).toBe('image/gif')
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))?.mime).toBe('image/webp')
    expect(sniffImage(new TextEncoder().encode('<svg'))).toBeNull()
  })

  test('linkedIds finds each /files/<uuid> once', () => {
    const id = '0b2f6a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
    expect(linkedIds(`![a](/files/${id}) and [b](/files/${id.toUpperCase()})`)).toEqual([id])
  })
})

describe('service files', () => {
  const spec = {
    bun: '/opt/bun/bin/bun',
    entry: '/g/kammacron/cli.js',
    dataDir: '/home/u/.kammacron',
    port: 7420,
    path: '/opt/bun/bin:/usr/bin',
  }
  test('launchd keeps the PATH and restarts', () => {
    const plist = launchdPlist(spec)
    expect(plist).toContain('<string>/opt/bun/bin:/usr/bin</string>')
    expect(plist).toContain('<key>KeepAlive</key><true/>')
    expect(plist).toContain('/home/u/.kammacron/logs/server.log')
  })
  test('systemd keeps the PATH and restarts', () => {
    const unit = systemdUnit(spec)
    expect(unit).toContain('Environment="PATH=/opt/bun/bin:/usr/bin"')
    expect(unit).toContain('Restart=always')
    expect(unit).toContain(
      'ExecStart="/opt/bun/bin/bun" --no-env-file --config=/dev/null "/g/kammacron/cli.js" start --port 7420',
    )
  })
})

describe('checkDir', () => {
  test('a missing directory fails; any directory passes, git or not, and says what it found', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kammacron-dir-'))
    try {
      expect((await checkDir(join(dir, 'nope'))).ok).toBe(false)
      const plain = await checkDir(dir)
      expect(plain.ok).toBe(true)
      expect(plain.checks.find((c) => c.name === 'git')?.detail).toContain('not a git repository')
      expect((await localGit(gitIn(dir))).repo).toBe(false)
      await exec(['git', 'init', '-q', '-b', 'main', dir], { cwd: dir })
      expect(await localGit(gitIn(dir))).toMatchObject({ repo: true, branch: 'main' })
      await Bun.write(join(dir, 'CLAUDE.md'), '# rules\n')
      const repo = await checkDir(dir)
      expect(repo.checks.find((c) => c.name === 'git')?.detail).toContain('on main')
      expect(repo.checks.find((c) => c.name === 'project instructions')?.detail).toBe('CLAUDE.md')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('static', () => {
  test('a rebuilt, longer index.html is served whole while the server runs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kc-web-'))
    try {
      await Bun.write(join(dir, 'index.html'), '<p>old</p>')
      const app = staticRoutes(dir)
      const get = async () => (await app.handle(new Request('http://x/board'))).text()
      expect(await get()).toBe('<p>old</p>')
      const longer = `<p>${'new '.repeat(50)}</p>`
      await Bun.write(join(dir, 'index.html'), longer)
      expect(await get()).toBe(longer)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('files the build named by content are kept for good; the rest are asked again', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kc-web-'))
    try {
      const names = ['main-L7F2M64O.js', 'chunk-B-9Iq97L.js', 'font-USE2SQXJ.woff2', 'sw.js']
      for (const name of [...names, 'index.html']) await Bun.write(join(dir, name), 'x')
      const app = staticRoutes(dir)
      const cache = async (path: string) =>
        (await app.handle(new Request(`http://x/${path}`))).headers.get('cache-control')
      for (const name of names.slice(0, 3))
        expect(await cache(name)).toBe('public, max-age=31536000, immutable')
      expect(await cache('sw.js')).toBe('no-cache')
      expect(await cache('board')).toBe('no-cache')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('text goes out compressed when the browser takes it, and unpacks to the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kc-web-'))
    try {
      const js = `console.log(${JSON.stringify('kammacron '.repeat(500))})`
      await Bun.write(join(dir, 'main-L7F2M64O.js'), js)
      await Bun.write(join(dir, 'index.html'), '<p>app</p>')
      const app = staticRoutes(dir)
      const get = (encoding: string) =>
        app.handle(
          new Request('http://x/main-L7F2M64O.js', { headers: { 'accept-encoding': encoding } }),
        )
      const br = await get('gzip, deflate, br')
      expect(br.headers.get('content-encoding')).toBe('br')
      expect(br.headers.get('content-type')).toContain('javascript')
      const brBody = new Uint8Array(await br.arrayBuffer())
      expect(brBody.length).toBeLessThan(js.length / 4)
      expect(brotliDecompressSync(brBody).toString()).toBe(js)
      const gz = await get('gzip')
      expect(gz.headers.get('content-encoding')).toBe('gzip')
      expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await gz.arrayBuffer())))).toBe(
        js,
      )
      const plain = await get('')
      expect(plain.headers.get('content-encoding')).toBeNull()
      expect(await plain.text()).toBe(js)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('the CLI banner', () => {
  test('shows for a person at a terminal, never into a pipe or a log', () => {
    expect(banner('1.2.3', { isTTY: false })).toBe('')
    expect(banner('1.2.3', { isTTY: true })).toContain('v1.2.3')
  })

  test('plain when colour is off', () => {
    const text = bannerText('1.2.3', false)
    expect(text).not.toContain('\u001B[')
    expect(text).toContain('| $$$$$$/')
    expect(bannerText('1.2.3', false, 80)).toContain('┴ ┴┴ ┴')
    expect(text).toContain('* * * * *  board · cron · agents   v1.2.3')
  })
})

describe('one-time sign-in codes', () => {
  const state = () => ({
    apiToken: 't',
    sessionSecret: 's',
    allowedHosts: [],
    runOf: () => undefined,
    loginCodes: new Map<string, number>(),
  })

  test('a code works once', () => {
    const s = state()
    const code = newLoginCode(s)
    expect(useLoginCode(s, code)).toBe(true)
    expect(useLoginCode(s, code)).toBe(false)
  })

  test('the link start prints lasts as long as asked, a default code a minute', () => {
    const s = state()
    const long = newLoginCode(s, 10 * 60_000)
    const short = newLoginCode(s)
    const now = Date.now()
    expect(s.loginCodes.get(long)).toBeGreaterThan(now + 9 * 60_000)
    expect(s.loginCodes.get(short)).toBeLessThanOrEqual(now + 60_000)
  })
})

describe('an agent process', () => {
  test('of a flood of stderr only the end is kept, redacted, and stdout still comes through', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kc-agent-'))
    try {
      const bin = join(dir, 'noisy-agent.ts')
      await Bun.write(
        bin,
        [
          "process.stderr.write('warning: noise\\n'.repeat(15000) + 'fatal: token sk-SECRET-1 gone\\n')",
          "console.log(JSON.stringify({ type: 'result', result: 'done' }))",
        ].join('\n'),
      )
      const lines: string[] = []
      const handle = spawnJsonLines(
        {
          bin: process.execPath,
          args: [bin],
          cwd: dir,
          env: { PATH: process.env['PATH'] ?? '' },
          prompt: '',
          onLine: (line) => {
            lines.push(line)
          },
          onEvent: () => undefined,
          secrets: ['sk-SECRET-1'],
          timeoutMs: 20_000,
        },
        { onJson: () => undefined, eventsOf: () => [], finish: (ended) => ended },
      )
      const ended = await Promise.race([
        handle.result,
        Bun.sleep(10_000).then(() => 'hung' as const),
      ])
      expect(ended).not.toBe('hung')
      if (ended === 'hung') return
      expect(lines).toContain('{"type":"result","result":"done"}')
      expect(ended.stderr.length).toBeLessThanOrEqual(16_000)
      expect(ended.stderr).toContain('fatal: token')
      expect(ended.stderr).not.toContain('sk-SECRET-1')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('exec', () => {
  test('the timeout ends what the command started, not only the shell', async () => {
    const t0 = Date.now()
    const r = await exec(['sh', '-c', 'sleep 30; echo late'], { cwd: tmpdir(), timeoutMs: 300 })
    expect(Date.now() - t0).toBeLessThan(5000)
    expect(r.code).not.toBe(0)
    expect(r.stdout).not.toContain('late')
  })

  test('keeps only the tail when asked', async () => {
    const r = await exec(['sh', '-c', 'yes line | head -n 50000; echo END'], {
      cwd: tmpdir(),
      tail: 50,
    })
    expect(r.stdout.length).toBe(50)
    expect(r.stdout.trim().endsWith('END')).toBe(true)
  })
})

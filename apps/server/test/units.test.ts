import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { launchdPlist, systemdUnit } from '../src/service'
import { linkedIds, sniffImage } from '../src/services/attachments'
import type { Project } from '../src/services/projects'
import { classify, eventsOf, redact } from '../src/worker/claude'
import { exec, gitIn, prePushHook } from '../src/worker/git'
import { toolLists } from '../src/worker/runner'

const project = (patch: Partial<Project> = {}) =>
  ({
    ship_policy: 'push',
    allowed_bash: ['Bash(bun test:*)'],
    web_tools: false,
    max_diff_lines: null,
    protected_paths: [],
    ...patch,
  }) as Project

describe('toolLists', () => {
  test('push policy: the card branch and the default branch, exact; denies force and --no-verify', () => {
    const { allowed, denied } = toolLists(project(), 'main', 12, ['zvec'])
    expect(allowed).toContain('Bash(git push origin HEAD:claude/12)')
    expect(allowed).toContain('Bash(git push origin HEAD:main)')
    expect(allowed).toContain('mcp__kammacron')
    expect(allowed).toContain('mcp__zvec')
    expect(allowed).toContain('Bash(bun test:*)')
    expect(allowed.some((tool) => tool.startsWith('Bash(git push:'))).toBe(false)
    for (const tool of [
      'Bash(git push --force:*)',
      'Bash(git commit --no-verify:*)',
      'Bash(git -c:*)',
    ])
      expect(denied).toContain(tool)
    expect(allowed).not.toContain('WebFetch')
  })

  test('branch policy never allows a push to the default branch; web tools only when on', () => {
    const { allowed } = toolLists(
      project({ ship_policy: 'branch', web_tools: true }),
      'main',
      3,
      [],
    )
    expect(allowed).not.toContain('Bash(git push origin HEAD:main)')
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
    expect(unit).toContain('ExecStart="/opt/bun/bin/bun" "/g/kammacron/cli.js" start --port 7420')
  })
})

describe('prePushHook', () => {
  test('finds a hook through core.hooksPath (husky), and none in a bare repo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kammacron-hook-'))
    try {
      await exec(['git', 'init', '-q', dir], { cwd: dir })
      const git = gitIn(dir)
      expect(await prePushHook(git)).toBeNull()
      await Bun.write(join(dir, '.husky', 'pre-push'), 'bun run check\n')
      await exec(['git', 'config', 'core.hooksPath', '.husky'], { cwd: dir })
      expect(await prePushHook(git)).toBe(join(dir, '.husky', 'pre-push'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

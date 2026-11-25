import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'

import { cards, projects, settings } from '../src/db/schema'
import { listAlerts } from '../src/services/alerts'
import { getCard, type Card } from '../src/services/cards'
import { getProject } from '../src/services/projects'
import { getRunWithEvents } from '../src/services/runs'
import { approveCard } from '../src/worker/approve'
import { exec } from '../src/worker/git'
import { runCard } from '../src/worker/runner'
import { createScheduler } from '../src/worker/scheduler'
import { must, testApp, type TestApp } from './helpers'

const FAKE = join(import.meta.dir, 'fixtures', 'fake-claude.ts')
let t: TestApp
let server: { stop: () => unknown; port: number }
let root: string
let remote: string
let repo: string
let projectId: number

const git = async (cwd: string, ...args: string[]) => {
  const r = await exec(['git', ...args], {
    cwd,
    env: {
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@x',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@x',
    },
  })
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const remoteHas = async (ref: string, file: string) =>
  (await exec(['git', '--git-dir', remote, 'cat-file', '-e', `${ref}:${file}`], { cwd: root }))
    .code === 0

beforeAll(() => {
  process.env['KAMMACRON_PASS_ENV'] = 'FAKE_SCENARIO'
})
afterAll(() => {
  delete process.env['KAMMACRON_PASS_ENV']
  delete process.env['FAKE_SCENARIO']
})

beforeEach(async () => {
  const port = { value: 0 }
  t = await testApp({ claudeBin: FAKE, serverUrl: () => `http://127.0.0.1:${String(port.value)}` })
  const listening = t.app.listen({ hostname: '127.0.0.1', port: 0 })
  port.value = must(listening.server).port ?? 0
  server = { stop: () => listening.stop(), port: port.value }

  root = await mkdtemp(join(tmpdir(), 'kammacron-git-'))
  remote = join(root, 'remote.git')
  repo = join(root, 'repo')
  await git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  await git(root, 'clone', '-q', remote, repo)
  await Bun.write(join(repo, 'README.md'), '# demo\n')
  await git(repo, 'add', 'README.md')
  await git(repo, 'commit', '-qm', 'init')
  await git(repo, 'push', '-q', 'origin', 'main')
  await git(repo, 'remote', 'set-head', 'origin', '--auto')

  const project = await t.json<{ id: number }>('POST', '/api/projects', {
    slug: 'demo',
    name: 'Demo',
    repo_path: repo,
    worker_enabled: true,
  })
  projectId = project.id
})

afterEach(async () => {
  await server.stop()
  await t.close()
  await rm(root, { recursive: true, force: true })
})

const newCard = async (title = 'fix it') => {
  const [card] = await t.json<Card[]>('POST', '/api/cards/batch', {
    cards: [{ project_id: projectId, title, tags: ['claude'] }],
  })
  return must(card)
}

const run = async (scenario: string, cardId: number) => {
  process.env['FAKE_SCENARIO'] = scenario
  return runCard(t.ctx.worker, await getProject(t.ctx.db, projectId), cardId)
}

describe('a run', () => {
  test('push: the commit reaches main, the card is done, events and comments are kept', async () => {
    const card = await newCard()
    const { run: r } = await run('push', card.id)
    const done = await getCard(t.ctx.db, card.id)
    expect(done.status).toBe('done')
    expect(must(r).status).toBe('succeeded')
    expect(must(r).pushed_to).toBe('main')
    expect(must(r).commits).toHaveLength(1)
    expect(await remoteHas('main', 'fixed.txt')).toBe(true)
    expect(done.comments.map((c) => [c.author, c.run_id])).toEqual([['claude-worker', must(r).id]])
    const withEvents = await getRunWithEvents(t.ctx.db, must(r).id)
    expect(withEvents.events.map((e) => e.type)).toContain('tool_use')
    expect(withEvents.summary).toBe(`DONE card=#${String(card.id)}`)
  })

  test('branch: work on claude/<card>, the card in review with its reason and branch', async () => {
    const card = await newCard()
    const { run: r } = await run('branch', card.id)
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('review')
    expect(after.review_reason).toBe('pre-push failed twice')
    expect(after.branch).toBe(`claude/${String(card.id)}`)
    expect(must(r).pushed_to).toBe(`claude/${String(card.id)}`)
    expect(await remoteHas('main', 'wip.txt')).toBe(false)
  })

  test('a run that ends without moving the card sends it to review', async () => {
    const card = await newCard()
    await run('silent', card.id)
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('review')
    expect(after.review_reason).toContain('without moving the card')
  })

  test('done without the commits on main goes to review instead', async () => {
    const card = await newCard()
    await run('done-without-push', card.id)
    expect((await getCard(t.ctx.db, card.id)).review_reason).toContain('not on origin/main')
  })

  test('a bad token pauses everything and gives the card back untouched', async () => {
    const card = await newCard()
    const { run: r } = await run('auth', card.id)
    expect(must(r).error_kind).toBe('auth')
    expect((await getCard(t.ctx.db, card.id)).status).toBe('todo')
    expect((await getCard(t.ctx.db, card.id)).stale_count).toBe(0)
    const [row] = await t.ctx.db.select().from(settings)
    expect(must(row).paused).toBe(true)
    expect((await listAlerts(t.ctx.db)).map((a) => a.level)).toEqual(['error'])
  })

  test('a usage limit postpones the project an hour without counting against the card', async () => {
    const card = await newCard()
    await run('rate', card.id)
    expect((await getCard(t.ctx.db, card.id)).status).toBe('todo')
    const project = await getProject(t.ctx.db, projectId)
    expect(must(project.next_run_at).getTime()).toBeGreaterThan(Date.now() + 55 * 60_000)
  })

  test('a push to a ref outside default and claude/* pauses the project', async () => {
    const card = await newCard()
    await run('evil', card.id)
    const project = await getProject(t.ctx.db, projectId)
    expect(project.paused_reason).toContain('somewhere-else')
  })

  test('stop: the process is killed and the card returns to todo, counted', async () => {
    const card = await newCard()
    const scheduler = createScheduler(t.ctx.worker)
    process.env['FAKE_SCENARIO'] = 'sleep'
    const pending = runCard(t.ctx.worker, await getProject(t.ctx.db, projectId), card.id)
    while (t.ctx.worker.handles.size === 0) await Bun.sleep(20)
    const [runId] = [...t.ctx.worker.handles.keys()]
    expect(scheduler.stopRun(must(runId))).toBe(true)
    const { run: r } = await pending
    expect(must(r).status).toBe('stopped')
    const after = await getCard(t.ctx.db, card.id)
    expect([after.status, after.stale_count]).toEqual(['todo', 1])
  })
})

describe('verify and revert', () => {
  test('verify fails on what was pushed: reverted on main, work kept on claude/<card>, card in review', async () => {
    await t.ctx.db
      .update(projects)
      .set({ verify_command: 'test ! -f broken' })
      .where(eq(projects.id, projectId))
    const card = await newCard()
    const { run: r } = await run('breaks', card.id)
    expect(must(r).status).toBe('reverted')
    expect(await remoteHas('main', 'broken')).toBe(false)
    expect(await remoteHas(`claude/${String(card.id)}`, 'broken')).toBe(true)
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('review')
    expect(after.review_reason).toContain('reverted')
    const log = await git(repo, '--git-dir', remote, 'log', '--format=%s', 'main')
    expect(log.split('\n')[0]).toContain(`revert: card #${String(card.id)}`)
  })

  test('verify that already failed before the run: nothing reverted, the project paused', async () => {
    await t.ctx.db
      .update(projects)
      .set({ verify_command: 'false' })
      .where(eq(projects.id, projectId))
    const card = await newCard()
    const { run: r } = await run('push', card.id)
    expect(must(r).status).toBe('failed')
    expect(await remoteHas('main', 'fixed.txt')).toBe(true)
    expect((await getProject(t.ctx.db, projectId)).paused_reason).toContain('before run')
  })
})

describe('the diff gate', () => {
  test('a small change on claude/<card> passes and kammacron pushes it to main', async () => {
    await t.ctx.db.update(projects).set({ max_diff_lines: 50 }).where(eq(projects.id, projectId))
    const card = await newCard()
    const { run: r } = await run('gated', card.id)
    expect(must(r).pushed_to).toBe('main')
    expect(await remoteHas('main', 'fixed.txt')).toBe(true)
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('done')
    expect(after.comments.at(-1)?.body).toContain('Passed the gate')
  })

  test('a protected path holds the card in review; main is untouched', async () => {
    await t.ctx.db
      .update(projects)
      .set({ protected_paths: ['migrations/**'] })
      .where(eq(projects.id, projectId))
    const card = await newCard()
    await run('gated-protected', card.id)
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('review')
    expect(after.review_reason).toContain('migrations/0001.sql')
    expect(await remoteHas('main', 'migrations/0001.sql')).toBe(false)
  })

  test('with a gate, Claude may not push to main itself', async () => {
    await t.ctx.db.update(projects).set({ max_diff_lines: 50 }).where(eq(projects.id, projectId))
    const { toolLists } = await import('../src/worker/runner')
    const project = await getProject(t.ctx.db, projectId)
    expect(toolLists(project, 'main', 1, []).allowed).not.toContain(
      'Bash(git push origin HEAD:main)',
    )
  })
})

describe('approve', () => {
  test('rebases claude/<card> onto main and pushes it', async () => {
    const card = await newCard()
    await run('branch', card.id)
    // main moves on meanwhile
    await Bun.write(join(repo, 'other.txt'), 'someone else\n')
    await git(repo, 'add', 'other.txt')
    await git(repo, 'commit', '-qm', 'other work')
    await git(repo, 'push', '-q', 'origin', 'main')
    const approved = await approveCard(t.ctx.worker, card.id)
    expect(approved.status).toBe('done')
    expect(await remoteHas('main', 'wip.txt')).toBe(true)
    expect(await remoteHas('main', 'other.txt')).toBe(true)
  })
})

describe('the scheduler', () => {
  test('a round runs pickable cards up to the limit; with nothing to do it records the check without Claude', async () => {
    const scheduler = createScheduler(t.ctx.worker)
    process.env['FAKE_SCENARIO'] = 'push'
    await newCard('one')
    await newCard('two')
    scheduler.runNow(projectId)
    await scheduler.idle()
    const all = await t.ctx.db.select().from(cards).where(eq(cards.project_id, projectId))
    expect(all.map((c) => c.status)).toEqual(['done', 'done'])
    scheduler.runNow(projectId)
    await scheduler.idle()
    const project = await getProject(t.ctx.db, projectId)
    expect(project.last_check_result).toBe('no cards')
    expect(must(project.next_run_at).getTime()).toBeGreaterThan(Date.now())
  })
})

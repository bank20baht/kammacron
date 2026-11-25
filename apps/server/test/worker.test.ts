import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'

import { cards, projects, settings, type PlaybookStep } from '../src/db/schema'
import { listAlerts } from '../src/services/alerts'
import { getCard, type Card } from '../src/services/cards'
import { getProject } from '../src/services/projects'
import { getRunWithEvents } from '../src/services/runs'
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

const playbook = (steps: PlaybookStep[]) =>
  t.ctx.db.update(projects).set({ playbook: steps }).where(eq(projects.id, projectId))

const stepsOf = async (runId: number) =>
  (await getRunWithEvents(t.ctx.db, runId)).steps.map((s) => [s.name, s.status])

describe('the default playbook: one Claude step', () => {
  test('Claude does the work its own way (here: commit and push); the card is done', async () => {
    const card = await newCard()
    const { run: r } = await run('push', card.id)
    const done = await getCard(t.ctx.db, card.id)
    expect(done.status).toBe('done')
    expect(must(r).status).toBe('succeeded')
    expect(await remoteHas('main', 'fixed.txt')).toBe(true)
    expect(done.comments.map((c) => [c.author, c.run_id])).toEqual([['claude-worker', must(r).id]])
    const withEvents = await getRunWithEvents(t.ctx.db, must(r).id)
    expect(withEvents.events.map((e) => e.type)).toContain('tool_use')
    expect(withEvents.summary).toBe(`DONE card=#${String(card.id)}`)
    expect(withEvents.steps.map((s) => [s.kind, s.status])).toEqual([['claude', 'succeeded']])
  })

  test('the directory is left as it is: no branch made, uncommitted work untouched', async () => {
    await Bun.write(join(repo, 'README.md'), '# mine, half done\n')
    const card = await newCard()
    const { run: r } = await run('done', card.id)
    expect(must(r).status).toBe('succeeded')
    expect(await Bun.file(join(repo, 'README.md')).text()).toBe('# mine, half done\n')
    expect(await git(repo, 'branch', '--format=%(refname:short)')).toBe('main')
    expect(await Bun.file(join(repo, '.kammacron')).exists()).toBe(false)
  })

  test('Claude hands the card to a person: review, and the run says so', async () => {
    const card = await newCard()
    const { run: r } = await run('review', card.id)
    const after = await getCard(t.ctx.db, card.id)
    expect([after.status, after.review_reason]).toEqual(['review', 'needs a person'])
    expect(must(r).status).toBe('review')
  })

  test('a run that ends without moving the card sends it to review', async () => {
    const card = await newCard()
    const { run: r } = await run('silent', card.id)
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('review')
    expect(after.review_reason).toContain('without moving the card')
    expect(must(r).status).toBe('failed')
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

  test('a directory that is gone: the round skips, the card is not claimed', async () => {
    await t.ctx.db
      .update(projects)
      .set({ repo_path: join(root, 'nope') })
      .where(eq(projects.id, projectId))
    const card = await newCard()
    const outcome = await run('done', card.id)
    expect(outcome.run).toBeNull()
    expect(outcome.skipped).toContain('does not exist')
    expect((await getCard(t.ctx.db, card.id)).status).toBe('todo')
  })
})

describe('a playbook of steps', () => {
  test('run steps around Claude: in the directory, with the card in the environment', async () => {
    await playbook([
      {
        kind: 'run',
        name: 'Read the card',
        command: 'echo "$KAMMACRON_CARD_TITLE"; head -1 "$KAMMACRON_CARD_FILE"',
      },
      { kind: 'claude', name: 'Claude' },
      { kind: 'run', name: 'Where', command: 'pwd' },
    ])
    const card = await newCard('ship the thing')
    const { run: r } = await run('done', card.id)
    expect(must(r).status).toBe('succeeded')
    const steps = (await getRunWithEvents(t.ctx.db, must(r).id)).steps
    expect(steps.map((s) => [s.name, s.status, s.exit_code])).toEqual([
      ['Read the card', 'succeeded', 0],
      ['Claude', 'succeeded', null],
      ['Where', 'succeeded', 0],
    ])
    expect(steps[0]?.output).toBe(`ship the thing\n# #${String(card.id)} ship the thing\n`)
    expect(steps[2]?.output?.trim()).toEndWith('repo')
    expect((await getCard(t.ctx.db, card.id)).status).toBe('done')
    // the run's folder (card file, attachments) is gone afterwards
    expect(await Bun.file(join(t.dataDir, 'runs', String(must(r).id), 'card.md')).exists()).toBe(
      false,
    )
  })

  test('without a Claude step: the commands alone, and the card is done when they pass', async () => {
    await playbook([{ kind: 'run', name: 'Test', command: 'true' }])
    const card = await newCard()
    const { run: r } = await run('sleep', card.id)
    expect(must(r).status).toBe('succeeded')
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('done')
    expect(after.comments.at(-1)?.body).toContain('The playbook passed: Test')
  })

  test('a step that fails stops the playbook: review, its output in a comment, the rest skipped', async () => {
    await playbook([
      { kind: 'claude', name: 'Claude' },
      { kind: 'run', name: 'Test', command: 'echo "2 tests failed" >&2; exit 3' },
      { kind: 'run', name: 'Deploy', command: 'touch deployed' },
    ])
    const card = await newCard()
    const { run: r } = await run('done', card.id)
    expect(must(r).status).toBe('failed')
    expect(must(r).error).toBe('step "Test" failed: exit 3')
    expect(await stepsOf(must(r).id)).toEqual([
      ['Claude', 'succeeded'],
      ['Test', 'failed'],
      ['Deploy', 'skipped'],
    ])
    const after = await getCard(t.ctx.db, card.id)
    expect(after.status).toBe('review')
    expect(after.review_reason).toBe('step "Test" failed: exit 3')
    expect(after.comments.at(-1)?.body).toContain('2 tests failed')
    expect(await Bun.file(join(repo, 'deployed')).exists()).toBe(false)
  })

  test('continue_on_error: a failing step is noted and the playbook goes on', async () => {
    await playbook([
      { kind: 'run', name: 'Lint', command: 'exit 1', continue_on_error: true },
      { kind: 'run', name: 'Deploy', command: 'touch deployed' },
    ])
    const card = await newCard()
    const { run: r } = await run('done', card.id)
    expect(must(r).status).toBe('succeeded')
    expect(await Bun.file(join(repo, 'deployed')).exists()).toBe(true)
  })

  test('when Claude hands the card over, the later steps wait', async () => {
    await playbook([
      { kind: 'claude', name: 'Claude' },
      { kind: 'run', name: 'Deploy', command: 'touch deployed' },
    ])
    const card = await newCard()
    const { run: r } = await run('review', card.id)
    expect(must(r).status).toBe('review')
    expect(await stepsOf(must(r).id)).toEqual([
      ['Claude', 'succeeded'],
      ['Deploy', 'skipped'],
    ])
    expect(await Bun.file(join(repo, 'deployed')).exists()).toBe(false)
  })

  test('stop reaches a run step too, and what it started', async () => {
    await playbook([{ kind: 'run', name: 'Long', command: 'sleep 30; touch late' }])
    const card = await newCard()
    const scheduler = createScheduler(t.ctx.worker)
    const started = Date.now()
    const pending = run('done', card.id)
    while (t.ctx.worker.handles.size === 0) await Bun.sleep(20)
    expect(scheduler.stopRun(must([...t.ctx.worker.handles.keys()][0]))).toBe(true)
    const { run: r } = await pending
    expect(Date.now() - started).toBeLessThan(5000)
    expect(must(r).status).toBe('stopped')
    expect(await stepsOf(must(r).id)).toEqual([['Long', 'stopped']])
    expect((await getCard(t.ctx.db, card.id)).status).toBe('todo')
  })

  test('the Claude step is told the steps around it', async () => {
    const { workerRules } = await import('../src/worker/prompt')
    const steps: PlaybookStep[] = [
      { kind: 'claude', name: 'Claude' },
      { kind: 'run', name: 'Deploy', command: "ssh app './deploy.sh'" },
    ]
    const rules = workerRules({
      project: await getProject(t.ctx.db, projectId),
      cardId: 1,
      projectRules: null,
      attachmentsDir: null,
      steps,
      index: 0,
    })
    expect(rules).toContain('step 1 of 2')
    expect(rules).toContain("- Deploy: `ssh app './deploy.sh'`")
  })
})

describe('approve', () => {
  test('a card in review is done; nothing is merged or pushed', async () => {
    const card = await newCard()
    await run('review', card.id)
    const approved = await t.json<{ status: string }>(
      'POST',
      `/api/cards/${String(card.id)}/approve`,
    )
    expect(approved.status).toBe('done')
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

  test('a round that skips says why, and alerts once while it stays so', async () => {
    await t.ctx.db
      .update(projects)
      .set({ repo_path: join(root, 'gone') })
      .where(eq(projects.id, projectId))
    await newCard()
    const scheduler = createScheduler(t.ctx.worker)
    for (let i = 0; i < 2; i++) {
      scheduler.runNow(projectId)
      await scheduler.idle()
    }
    const project = await getProject(t.ctx.db, projectId)
    expect(project.last_check_result).toBe(
      `skipped: the directory ${join(root, 'gone')} does not exist`,
    )
    const skips = (await listAlerts(t.ctx.db)).filter((a) => a.message.includes('round skipped'))
    expect(skips).toHaveLength(1)
  })
})

describe('the board', () => {
  test('GET /projects/:id/git: the branch, uncommitted changes, ahead and behind', async () => {
    type LocalGit = { branch: string; dirty: boolean; ahead: number; behind: number }
    const clean = await t.json<LocalGit>('GET', `/api/projects/${String(projectId)}/git`)
    expect(clean).toEqual({ branch: 'main', dirty: false, ahead: 0, behind: 0 })
    await Bun.write(join(repo, 'new.txt'), 'x\n')
    const dirty = await t.json<LocalGit>('GET', `/api/projects/${String(projectId)}/git`)
    expect(dirty.dirty).toBe(true)
  })
})

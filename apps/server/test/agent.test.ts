import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'

import { schedules } from '../src/db/schema'
import { claudeAgents, codexModels, parseAgent } from '../src/services/agents'
import { getCard, type Card } from '../src/services/cards'
import { cronTimes, nextCron, nextScheduleRun, parseCron } from '../src/services/cron'
import { getRunWithEvents, listRuns } from '../src/services/runs'
import { classifyCodex, codexEventsOf } from '../src/worker/codex'
import { createScheduler } from '../src/worker/scheduler'
import { must, testApp, type TestApp } from './helpers'

const FAKE_CODEX = join(import.meta.dir, 'fixtures', 'fake-codex.ts')
const FAKE_CLAUDE = join(import.meta.dir, 'fixtures', 'fake-claude.ts')

/** A Claude Code agent file, as `.claude/agents/<name>.md` holds one. */
const agentFile = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Reviews the code ${name}\n${extra}---\nYou review code.\n`

describe('Claude Code agents and the models on offer', () => {
  let home: string
  let project: string
  const saved = { claude: process.env['CLAUDE_CONFIG_DIR'], codex: process.env['CODEX_HOME'] }

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kammacron-home-'))
    project = await mkdtemp(join(tmpdir(), 'kammacron-proj-'))
    process.env['CLAUDE_CONFIG_DIR'] = join(home, 'claude')
    process.env['CODEX_HOME'] = join(home, 'codex')
  })
  afterEach(async () => {
    if (saved.claude === undefined) delete process.env['CLAUDE_CONFIG_DIR']
    else process.env['CLAUDE_CONFIG_DIR'] = saved.claude
    if (saved.codex === undefined) delete process.env['CODEX_HOME']
    else process.env['CODEX_HOME'] = saved.codex
    await rm(home, { recursive: true, force: true })
    await rm(project, { recursive: true, force: true })
  })

  test('reads an agent file: its name, words, model and tools', () => {
    const agent = parseAgent(agentFile('rev', 'model: haiku\ntools: Read, Grep\n'), 'project')
    expect(agent).toMatchObject({ name: 'rev', model: 'haiku', tools: ['Read', 'Grep'] })
    expect(agent?.prompt).toBe('You review code.')
    expect(parseAgent(agentFile('x', 'model: inherit\n'), 'user')?.model).toBeNull()
    expect(parseAgent('no front matter', 'user')).toBeNull()
  })

  test("the project's agents, the person's, and those of the plugins they turned on", async () => {
    await Bun.write(join(project, '.claude', 'agents', 'rev.md'), agentFile('rev'))
    await Bun.write(join(home, 'claude', 'agents', 'rev.md'), agentFile('rev', 'model: opus\n'))
    await Bun.write(join(home, 'claude', 'agents', 'mine.md'), agentFile('mine'))
    const plugin = join(home, 'claude', 'plugins', 'cache', 'tidy')
    await Bun.write(join(plugin, 'agents', 'sweep.md'), agentFile('sweep'))
    await Bun.write(
      join(home, 'claude', 'plugins', 'cache', 'off', 'agents', 'no.md'),
      agentFile('no'),
    )
    await Bun.write(
      join(home, 'claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'tidy@market': [{ scope: 'user', installPath: plugin }],
          'off@market': [
            { scope: 'user', installPath: join(home, 'claude', 'plugins', 'cache', 'off') },
          ],
        },
      }),
    )
    await Bun.write(
      join(home, 'claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'tidy@market': true, 'off@market': false } }),
    )
    const agents = await claudeAgents(project)
    expect(agents.map((a) => `${a.source}:${a.name}`)).toEqual([
      'project:rev', // the project's wins over the person's of the same name
      'user:mine',
      'plugin:tidy:sweep',
    ])
  })

  test("Codex's models from its cache, hidden ones left out; none without one", async () => {
    expect(await codexModels()).toEqual([])
    await Bun.write(
      join(home, 'codex', 'models_cache.json'),
      JSON.stringify({
        models: [
          { slug: 'b', display_name: 'B', description: 'second', priority: 2, visibility: 'list' },
          { slug: 'h', display_name: 'H', priority: 0, visibility: 'hide' },
          { slug: 'a', display_name: 'A', description: 'first', priority: 1, visibility: 'list' },
        ],
      }),
    )
    expect((await codexModels()).map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('cron expressions', () => {
  const at = (s: string) => new Date(s)

  test('the next minute each kind of field names, in local time', () => {
    const from = at('2026-11-26T10:17:30')
    expect(nextCron('*/15 * * * *', from)).toEqual(at('2026-11-26T10:30:00'))
    expect(nextCron('0 9 * * *', from)).toEqual(at('2026-11-27T09:00:00'))
    expect(nextCron('0 9 * * 1-5', at('2026-11-27T10:00'))).toEqual(at('2026-11-30T09:00:00')) // Fri → Mon
    expect(nextCron('30 8 1 * *', from)).toEqual(at('2026-12-01T08:30:00'))
    expect(nextCron('@hourly', from)).toEqual(at('2026-11-26T11:00:00'))
    expect(nextCron('0 0 * * 7', from)).toEqual(at('2026-11-29T00:00:00')) // 7 is Sunday
  })

  test('some days of the week, as an alarm clock is set (Tue and Thu)', () => {
    expect(nextCron('30 7 * * 2,4', at('2026-11-26T12:00'))).toEqual(at('2026-12-01T07:30:00')) // Thu noon → Tue
    expect(nextCron('30 7 * * 2,4', at('2026-12-01T08:00'))).toEqual(at('2026-12-03T07:30:00')) // Tue → Thu
  })

  test('both day fields restricted: a day matching either runs', () => {
    // the 1st of the month, or a Monday
    expect(nextCron('0 0 1 * 1', at('2026-11-26T12:00'))).toEqual(at('2026-11-30T00:00:00'))
  })

  test('strictly after: the minute it is now does not count', () => {
    expect(nextCron('0 9 * * *', at('2026-11-26T09:00:00'))).toEqual(at('2026-11-27T09:00:00'))
  })

  test('bad expressions say what is wrong; a day that never comes has no next time', () => {
    expect(() => parseCron('* * *')).toThrow('5 fields')
    expect(() => parseCron('60 * * * *')).toThrow('minute')
    expect(() => parseCron('x * * * *')).toThrow('not a number')
    expect(() => parseCron('*/0 * * * *')).toThrow('step')
    expect(nextCron('0 0 31 2 *', at('2026-01-01'))).toBeNull()
  })

  test('times in a range, and a schedule without cron goes by its interval', () => {
    const times = cronTimes('0 */6 * * *', at('2026-11-26T00:00'), at('2026-11-27T00:00'))
    expect(times.map((d) => d.getHours())).toEqual([0, 6, 12, 18])
    const from = at('2026-11-26T10:00')
    expect(nextScheduleRun({ cron: null, interval_minutes: 30 }, from)).toEqual(
      at('2026-11-26T10:30'),
    )
    expect(nextScheduleRun({ cron: '0 12 * * *', interval_minutes: 30 }, from)).toEqual(
      at('2026-11-26T12:00'),
    )
  })
})

describe('reading codex exec --json', () => {
  test('its items become the events a Claude run writes', () => {
    expect(codexEventsOf({ type: 'thread.started', thread_id: 'th' })).toEqual([
      { type: 'system', summary: 'init', data: { thread_id: 'th' } },
    ])
    const ran = codexEventsOf({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'bun test', aggregated_output: '', exit_code: 1 },
    })
    expect(ran.map((e) => [e.type, e.summary])).toEqual([
      ['tool_use', 'Bash bun test'],
      ['tool_result', 'error: (empty)'],
    ])
    expect(
      codexEventsOf({ type: 'item.completed', item: { type: 'agent_message', text: ' hi ' } })[0]
        ?.summary,
    ).toBe('hi')
    expect(codexEventsOf({ type: 'item.completed', item: { type: 'reasoning' } })).toEqual([])
    expect(codexEventsOf({ type: 'turn.failed', error: { message: 'boom' } })[0]?.type).toBe(
      'result',
    )
  })

  test('why a run failed: sign-in, usage limit, stop, or a crash', () => {
    expect(classifyCodex(null, 0, false, true)).toBeNull()
    expect(classifyCodex('401 Unauthorized', 1, false, false)).toBe('auth')
    expect(classifyCodex('You have hit your usage limit', 1, false, false)).toBe('rate_limit')
    expect(classifyCodex(null, 143, true, false)).toBe('stopped')
    expect(classifyCodex(null, 0, false, false)).toBe('crash') // ended without finishing a turn
  })
})

describe('agent schedules', () => {
  let t: TestApp
  let listening: { stop: () => unknown }
  let dir: string
  let projectId: number

  beforeAll(() => {
    process.env['KAMMACRON_PASS_ENV'] = 'FAKE_SCENARIO,FAKE_CARD'
  })
  afterAll(() => {
    delete process.env['KAMMACRON_PASS_ENV']
    delete process.env['FAKE_SCENARIO']
    delete process.env['FAKE_CARD']
  })

  beforeEach(async () => {
    const port = { value: 0 }
    t = await testApp({
      codexBin: FAKE_CODEX,
      serverUrl: () => `http://127.0.0.1:${String(port.value)}`,
    })
    const server = t.app.listen({ hostname: '127.0.0.1', port: 0 })
    port.value = must(server.server).port ?? 0
    listening = { stop: () => server.stop() }
    dir = await mkdtemp(join(tmpdir(), 'kammacron-agent-'))
    // the worker is off: a schedule runs on its own time all the same
    const project = await t.json<{ id: number }>('POST', '/api/projects', {
      slug: 'demo',
      name: 'Demo',
      repo_path: dir,
    })
    projectId = project.id
  })

  afterEach(async () => {
    await listening.stop()
    await t.close()
    await rm(dir, { recursive: true, force: true })
  })

  const card = async (title: string, tags: string[], project = projectId) =>
    must(
      (
        await t.json<Card[]>('POST', '/api/cards/batch', {
          cards: [{ project_id: project, title, tags }],
        })
      )[0],
    )

  const schedule = (body: Record<string, unknown>) =>
    t.json<{ id: number }>('POST', `/api/projects/${String(projectId)}/schedules`, {
      name: 'hourly codex',
      agent: 'codex',
      prompt: 'Take one auto-pilot card, do it, and write the result on the card.',
      cron: '0 * * * *',
      ...body,
    })

  /** Makes every schedule due, and lets the scheduler run them. */
  const fire = async (scenario: string) => {
    process.env['FAKE_SCENARIO'] = scenario
    await t.ctx.db.update(schedules).set({ next_run_at: new Date(Date.now() - 1000) })
    const scheduler = createScheduler(t.ctx.worker)
    await scheduler.tick()
    await scheduler.idle()
  }

  test('Codex takes an auto-pilot card through MCP and writes the result on it', async () => {
    const mine = await card('fix the typo', ['auto-pilot'])
    await card('not for agents', [])
    const s = await schedule({})
    await fire('take')

    const done = await getCard(t.ctx.db, mine.id)
    expect(done.status).toBe('done')
    expect(done.comments.map((c) => [c.author, c.body])).toEqual([
      ['claude-worker', `codex did #${String(mine.id)}`],
    ])
    const [run] = await listRuns(t.ctx.db, { project_id: projectId })
    expect(run).toMatchObject({
      agent: 'codex',
      card_id: null,
      schedule_id: s.id,
      schedule_name: 'hourly codex',
      status: 'succeeded',
      session_id: 'fake-thread',
      summary: `took #${String(mine.id)}`,
    })
    const full = await getRunWithEvents(t.ctx.db, must(run).id)
    expect(full.steps.map((step) => [step.kind, step.status])).toEqual([['codex', 'succeeded']])
    expect(full.events.some((e) => e.summary === 'mcp__kammacron__move_card')).toBe(true)

    const [row] = await t.ctx.db.select().from(schedules).where(eq(schedules.id, s.id))
    expect(row?.last_result).toBe(`run ${String(must(run).id)} succeeded`)
    expect(row?.last_run_id).toBe(must(run).id)
    // the next time is the cron's: the top of an hour still to come
    const next = must(row?.next_run_at)
    expect(next.getMinutes()).toBe(0)
    expect(next.getTime()).toBeGreaterThan(Date.now())
  })

  test('without use_board the prompt is the schedule’s alone', async () => {
    await card('fix the typo', ['auto-pilot'])
    await schedule({ use_board: false, prompt: 'Update the changelog.' })
    await fire('echo')
    const [run] = await listRuns(t.ctx.db, { project_id: projectId })
    expect(run?.summary).toContain('Update the changelog.')
    expect(run?.summary).not.toContain('fix the typo')
  })

  test('with use_board the open auto-pilot cards come with the prompt', async () => {
    await card('fix the typo', ['auto-pilot'])
    await schedule({})
    await fire('echo')
    const [run] = await listRuns(t.ctx.db, { project_id: projectId })
    expect(run?.summary).toContain('fix the typo')
  })

  test("a schedule's run reaches the cards of its own project only", async () => {
    const other = await t.json<{ id: number }>('POST', '/api/projects', {
      slug: 'other',
      name: 'Other',
    })
    const theirs = await card('theirs', ['auto-pilot'], other.id)
    process.env['FAKE_CARD'] = String(theirs.id)
    await schedule({})
    await fire('other-card')
    expect((await getCard(t.ctx.db, theirs.id)).comments).toEqual([])
    const [run] = await listRuns(t.ctx.db, { project_id: projectId })
    expect(run?.summary).toContain('NOT_YOUR_CARD')
  })

  test('a failed run is recorded as failed, with what Codex said', async () => {
    await schedule({})
    await fire('fail')
    const [run] = await listRuns(t.ctx.db, { project_id: projectId })
    expect(run).toMatchObject({ status: 'failed', error_kind: 'crash' })
    expect(run?.error).toContain('stream disconnected')
  })

  test('a schedule runs exactly one thing; an agent needs a prompt; a cron must come', async () => {
    const post = (body: Record<string, unknown>) =>
      t.call('POST', `/api/projects/${String(projectId)}/schedules`, { name: 'x', ...body })
    expect((await post({ agent: 'codex' })).status).toBe(422)
    expect((await post({ agent: 'codex', prompt: 'p', command: 'true' })).status).toBe(422)
    expect((await post({ command: 'true', cron: '61 * * * *' })).status).toBe(422)
    expect((await post({ command: 'true', cron: '0 0 31 2 *' })).status).toBe(422)
    expect((await post({ agent: 'claude', prompt: 'p', cron: '0 9 * * 1-5' })).status).toBe(200)
  })

  test('the options: the CLIs this machine has, the agents, and the models', async () => {
    await Bun.write(join(dir, '.claude', 'agents', 'rev.md'), agentFile('rev'))
    type Options = {
      claude: { agents: { name: string; source: string }[]; models: { id: string }[] } | null
      codex: { models: unknown[] } | null
    }
    const options = () => t.json<Options>('GET', `/api/projects/${String(projectId)}/agents`)
    t.ctx.worker.claudeBin = FAKE_CLAUDE
    const both = await options()
    expect(both.claude?.agents.map((a) => `${a.source}:${a.name}`)).toContain('project:rev')
    expect(both.claude?.models.map((m) => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
    expect(both.codex).not.toBeNull()
    // a CLI this machine has not: no options for it at all
    t.ctx.worker.claudeBin = join(dir, 'no-claude-here')
    t.ctx.worker.codexBin = 'kammacron-no-such-codex'
    expect(await options()).toEqual({ claude: null, codex: null })
  })

  test("a Claude cron job runs as the project's agent, which keeps the board's tools", async () => {
    t.ctx.worker.claudeBin = FAKE_CLAUDE
    await Bun.write(
      join(dir, '.claude', 'agents', 'rev.md'),
      agentFile('rev', 'model: haiku\ntools: Read\n'),
    )
    const post = (body: Record<string, unknown>) =>
      t.call('POST', `/api/projects/${String(projectId)}/schedules`, {
        name: 'review',
        agent: 'claude',
        prompt: 'Review the last commit.',
        cron: '0 * * * *',
        ...body,
      })
    // an agent the project has not, or one for Codex, is refused
    expect((await post({ claude_agent: 'nobody' })).status).toBe(422)
    expect((await post({ agent: 'codex', claude_agent: 'rev' })).status).toBe(422)
    expect((await post({ claude_agent: 'rev' })).status).toBe(200)

    await fire('args')
    const [run] = await listRuns(t.ctx.db, { project_id: projectId })
    const said = JSON.parse(must(run).summary ?? '{}') as {
      agent: string
      agents: Record<string, { prompt: string; tools: string[]; model: string }>
      model: string
    }
    expect(said.agent).toBe('rev')
    expect(said.model).toBe('haiku') // the agent's own, as the schedule names none
    expect(said.agents['rev']?.prompt).toBe('You review code.')
    expect(said.agents['rev']?.tools).toEqual(['Read', 'mcp__kammacron'])

    // the agent's file gone: the run fails and says why
    await rm(join(dir, '.claude'), { recursive: true })
    await fire('args')
    const [failed] = await listRuns(t.ctx.db, { project_id: projectId })
    expect(must(failed).status).toBe('failed')
    expect(must(failed).error).toContain('no Claude Code agent "rev"')
  })
})

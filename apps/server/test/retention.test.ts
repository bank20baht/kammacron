import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { eq, sql } from 'drizzle-orm'

import {
  alerts,
  attachments,
  cards,
  comments,
  runEvents,
  runs,
  runSteps,
  schedules,
} from '../src/db/schema'
import { addAlert } from '../src/services/alerts'
import { addComment, moveCard } from '../src/services/cards'
import { createRun, endStep, startStep } from '../src/services/runs'
import { runLogDir, type Retention } from '../src/services/retention'
import { must, testApp, type TestApp } from './helpers'

let t: TestApp
let projectId: number

beforeEach(async () => {
  t = await testApp()
  projectId = (await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'Shop' }))
    .id
})
afterEach(() => t.close())

const newCard = async (title: string) =>
  must(
    (
      await t.json<{ id: number }[]>('POST', '/api/cards/batch', {
        cards: [{ project_id: projectId, title }],
      })
    )[0],
  ).id

const daysAgo = (days: number) => sql`now() - make_interval(days => ${days})`

/** A finished run started `days` ago, with a step's output and a log file of that age. */
const oldRun = async (days: number) => {
  const run = await createRun(t.ctx.db, { project_id: projectId, card_id: null, log_path: null })
  await t.ctx.db
    .update(runs)
    .set({ status: 'succeeded', started_at: daysAgo(days), ended_at: daysAgo(days) })
    .where(eq(runs.id, run.id))
  const step = await startStep(t.ctx.db, {
    run_id: run.id,
    position: 0,
    kind: 'run',
    name: 'x',
    command: 'true',
  })
  await endStep(t.ctx.db, step.id, { status: 'succeeded', output: 'ok' })
  await t.ctx.db
    .update(runSteps)
    .set({ created_at: daysAgo(days) })
    .where(eq(runSteps.id, step.id))
  const dir = runLogDir(t.dataDir)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${String(run.id)}.jsonl`)
  await writeFile(file, '{}\n')
  const when = new Date(Date.now() - days * 86_400_000)
  await utimes(file, when, when)
  return { run: run.id, file }
}

const RECOMMENDED: Retention = {
  run_log_retention_days: 30,
  step_output_retention_days: 90,
  run_retention_days: 365,
  done_card_archive_days: 14,
  archived_card_retention_days: 180,
  alert_retention_days: 30,
}

type Summary = { retention: Retention; kinds: { key: string; total: number; due: number }[] }

describe('retention', () => {
  test('a new install keeps each kind for the recommended length', async () => {
    const summary = await t.json<Summary>('GET', '/api/data')
    expect(summary.retention).toEqual(RECOMMENDED)
  })

  test('done cards are archived, then removed with their comments; their runs stay', async () => {
    const done = await newCard('old done')
    const fresh = await newCard('just done')
    const open = await newCard('still to do')
    for (const id of [done, fresh]) await moveCard(t.ctx.db, id, { status: 'done' })
    await addComment(t.ctx.db, done, { author: 'user', body: 'noted' })
    const run = await createRun(t.ctx.db, { project_id: projectId, card_id: done, log_path: null })
    await t.ctx.db.insert(attachments).values({
      card_id: done,
      sha256: 'a'.repeat(64),
      filename: 'x.png',
      mime: 'image/png',
      size: 1,
      uploaded_by: 'user',
    })
    await t.ctx.db
      .update(cards)
      .set({ done_at: daysAgo(20) })
      .where(eq(cards.id, done))

    // a shorter length, before saving: what it would let go
    const preview = await t.json<Summary>('GET', '/api/data?done_card_archive_days=7')
    expect(preview.kinds.find((k) => k.key === 'done_card_archive_days')).toMatchObject({
      total: 2,
      due: 1,
    })

    const first = await t.json<Record<string, number>>('POST', '/api/data/clean')
    expect(first['done_card_archive_days']).toBe(1)
    const [archived] = await t.ctx.db.select().from(cards).where(eq(cards.id, done))
    expect(archived?.archived).toBe(true)

    await t.ctx.db
      .update(cards)
      .set({ archived_at: daysAgo(200) })
      .where(eq(cards.id, done))
    const second = await t.json<Record<string, number>>('POST', '/api/data/clean')
    expect(second['archived_card_retention_days']).toBe(1)
    expect(await t.ctx.db.select().from(cards).where(eq(cards.id, done))).toHaveLength(0)
    expect(await t.ctx.db.select().from(comments).where(eq(comments.card_id, done))).toHaveLength(0)
    // the run stays for Stats, no longer pointing at a card
    expect((await t.ctx.db.select().from(runs).where(eq(runs.id, run.id)))[0]?.card_id).toBeNull()
    const ids = (await t.ctx.db.select({ id: cards.id }).from(cards)).map((c) => c.id)
    expect(ids.sort()).toEqual([fresh, open].sort())
  })

  test('a card moved back from done starts its clock again', async () => {
    const id = await newCard('back and forth')
    await moveCard(t.ctx.db, id, { status: 'done' })
    await moveCard(t.ctx.db, id, { status: 'todo' })
    expect((await t.ctx.db.select().from(cards).where(eq(cards.id, id)))[0]?.done_at).toBeNull()
  })

  test('old logs, step output, runs and read alerts go; never keeps them', async () => {
    const young = await oldRun(40) // past the log and step lengths, not the run's
    const ancient = await oldRun(400) // past every length
    await addAlert(t.ctx.db, { level: 'info', message: 'read', run_id: ancient.run })
    await addAlert(t.ctx.db, { level: 'info', message: 'unread' })
    await t.ctx.db
      .update(alerts)
      .set({ created_at: daysAgo(60) })
      .where(sql`true`)
    await t.ctx.db.update(alerts).set({ read: true }).where(eq(alerts.message, 'read'))

    // "never" on runs keeps the old one
    await t.json('PATCH', '/api/settings', { run_retention_days: null })
    const first = await t.json<Record<string, number>>('POST', '/api/data/clean')
    expect(await t.ctx.db.select().from(runs)).toHaveLength(2)
    // the read alert, 60 days old, is past its 30; the unread one stays whatever its age
    expect(first['alert_retention_days']).toBe(1)

    await t.json('PATCH', '/api/settings', {
      run_retention_days: 365,
      step_output_retention_days: 30,
    })
    const done = await t.json<Record<string, number>>('POST', '/api/data/clean')
    expect(done['run_retention_days']).toBe(1)
    expect((await t.ctx.db.select().from(runs)).map((r) => r.id)).toEqual([young.run])
    expect(await Bun.file(young.file).exists()).toBe(false)
    expect(await Bun.file(ancient.file).exists()).toBe(false)
    const [step] = await t.ctx.db.select().from(runSteps).where(eq(runSteps.run_id, young.run))
    expect(step?.output).toBeNull()
    expect((await t.ctx.db.select().from(alerts)).map((a) => a.message)).toEqual(['unread'])
  })
})

describe('a long backlog', () => {
  test('old events go in batches, all of them; a newer one stays', async () => {
    const { run } = await oldRun(40)
    const old = daysAgo(40)
    const rows = Array.from({ length: 12_000 }, (_, i) => ({
      run_id: run,
      seq: i + 1,
      type: 'assistant' as const,
      summary: 'x',
      created_at: old,
    }))
    for (let i = 0; i < rows.length; i += 2000)
      await t.ctx.db.insert(runEvents).values(rows.slice(i, i + 2000))
    await t.ctx.db
      .insert(runEvents)
      .values({ run_id: run, seq: 12_001, type: 'assistant', summary: 'new' })
    const done = await t.json<Record<string, number>>('POST', '/api/data/clean')
    expect(done['run_log_retention_days']).toBe(12_000)
    const left = await t.ctx.db.select().from(runEvents)
    expect(left.map((e) => e.summary)).toEqual(['new'])
  }, 60_000)
})

describe('what only a person removes', () => {
  test('a project goes only when its name is typed, with its cards, runs and cron jobs', async () => {
    const card = await newCard('a card')
    await createRun(t.ctx.db, { project_id: projectId, card_id: card, log_path: null })
    await t.json('POST', `/api/projects/${String(projectId)}/schedules`, {
      name: 'check',
      command: 'true',
      cron: '0 9 * * 1',
    })
    const wrong = await t.call('DELETE', `/api/projects/${String(projectId)}?confirm=nope`)
    expect(wrong.status).toBe(422)
    // a run going keeps it
    await t.ctx.db.update(runs).set({ status: 'running' })
    expect((await t.call('DELETE', `/api/projects/${String(projectId)}?confirm=Shop`)).status).toBe(
      409,
    )
    await t.ctx.db.update(runs).set({ status: 'stopped', ended_at: new Date() })
    await t.json('DELETE', `/api/projects/${String(projectId)}?confirm=Shop`)
    expect(await t.ctx.db.select().from(cards)).toHaveLength(0)
    expect(await t.ctx.db.select().from(runs)).toHaveLength(0)
    expect(await t.ctx.db.select().from(schedules)).toHaveLength(0)
  })

  test('a cron job is removed and its runs stay; a run’s token can remove neither', async () => {
    const job = await t.json<{ id: number }>(
      'POST',
      `/api/projects/${String(projectId)}/schedules`,
      {
        name: 'check',
        command: 'true',
        cron: '0 9 * * 1',
      },
    )
    const run = await createRun(t.ctx.db, { project_id: projectId, card_id: null, log_path: null })
    await t.ctx.db.update(runs).set({ schedule_id: job.id }).where(eq(runs.id, run.id))

    t.ctx.worker.runTokens.set('run-token', { runId: run.id, projectId })
    const asRun = { authorization: 'Bearer run-token' }
    expect(
      (await t.call('DELETE', `/api/schedules/${String(job.id)}`, undefined, asRun)).status,
    ).toBe(401)
    expect(
      (await t.call('DELETE', `/api/projects/${String(projectId)}?confirm=Shop`, undefined, asRun))
        .status,
    ).toBe(401)
    expect((await t.call('POST', '/api/data/clean', undefined, asRun)).status).toBe(401)

    await t.json('DELETE', `/api/schedules/${String(job.id)}`)
    expect(await t.ctx.db.select().from(schedules)).toHaveLength(0)
    expect((await t.ctx.db.select().from(runs))[0]?.schedule_id).toBeNull()
  })
})

import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { eq } from 'drizzle-orm'

import {
  cards,
  DEFAULT_PLAYBOOK_NAME,
  DEFAULT_PLAYBOOKS,
  PLAYBOOK_TAG,
  projects,
  type ClaudeStep,
  type PlaybookStep,
  type RunStep,
} from '../db/schema'
import { newToken } from '../secrets'
import { addAlert } from '../services/alerts'
import { attachmentPath, cardAttachments } from '../services/attachments'
import { addComment, claimCard, getCard, moveCard, type Card } from '../services/cards'
import type { Project } from '../services/projects'
import {
  addRunEvent,
  createRun,
  endStep,
  previousRuns,
  skipSteps,
  startStep,
  updateRun,
  type Run,
} from '../services/runs'
import { getSettings, updateSettings } from '../services/settings'
import { spawnClaude, type ClaudeResult } from './claude'
import { childEnv, type RunHandle, type WorkerEnv } from './env'
import { approvedServers, type McpServer } from './mcp-approvals'
import { indented, taskPrompt, workerRules } from './prompt'
import { spawnShell } from './shell'

/**
 * The tools of a Claude step. Exact for everything but git, where the project's own instructions
 * decide the workflow (branches, worktrees, pushes); what could lose work stays refused.
 */
export const toolLists = (
  project: Project,
  step: ClaudeStep,
  mcpServers: readonly string[],
  dataDir?: string,
) => {
  const allowed = [
    // Reading the directory (and attachments) needs no rule; writing is for the directory only
    // (`Edit` rules cover Write). Grep and Glob exist only when named, and bare they search anywhere.
    'Edit(./**)',
    'Glob(./**)',
    'Grep(./**)',
    'mcp__kammacron',
    ...mcpServers.map((name) => `mcp__${name}`),
    ...[
      'status',
      'diff',
      'log',
      'show',
      'add',
      'commit',
      'fetch',
      'pull',
      'push',
      'rebase',
      'merge',
      'cherry-pick',
      'revert',
      'restore',
      'checkout',
      'switch',
      'branch',
      'worktree',
      'tag',
      'rev-parse',
      'stash',
      'merge-base',
      'ls-files',
      'blame',
      'mv',
      'rm',
    ].map((cmd) => `Bash(git ${cmd}:*)`),
    ...project.allowed_bash,
    ...(step.allow ?? []),
    ...(project.web_tools ? ['WebSearch', 'WebFetch'] : []),
  ]
  const denied = [
    'Bash(git push --force:*)',
    'Bash(git push -f:*)',
    'Bash(git push --force-with-lease:*)',
    'Bash(git push --no-verify:*)',
    'Bash(git push --delete:*)',
    'Bash(git push --mirror:*)',
    'Bash(git push origin +:*)',
    'Bash(git push origin --force:*)',
    'Bash(git push origin -f:*)',
    'Bash(git commit --no-verify:*)',
    'Bash(git commit -n:*)',
    'Bash(git reset --hard:*)',
    'Bash(git clean:*)',
    'Bash(git filter-branch:*)',
    'Bash(git branch -D:*)',
    'Bash(git config:*)',
    'Bash(git remote:*)',
    'Bash(git -c:*)',
    // the same, with the flag later in the line
    'Bash(git push * --force*)',
    'Bash(git push * -f*)',
    'Bash(git push * --delete*)',
    'Bash(git push * --mirror*)',
    'Bash(git push * +*)',
    'Bash(git * --no-verify*)',
    'Bash(git commit * -n*)',
    // git options that run any program
    'Bash(git rebase * --exec*)',
    'Bash(git rebase --exec*)',
    'Bash(git rebase * -x*)',
    'Bash(git rebase -x*)',
    // short flags written together, and the long one abbreviated
    'Bash(git rebase -fx*)',
    'Bash(git rebase -ix*)',
    'Bash(git rebase -qx*)',
    'Bash(git rebase -vx*)',
    'Bash(git rebase * --ex*)',
    'Bash(git rebase --ex*)',
    'Bash(git * --upload-pack*)',
    'Bash(git * --receive-pack*)',
    // what decides what a later run may do
    'Edit(./.claude/**)',
    'Edit(./.claude-worker/**)',
    'Edit(./.mcp.json)',
    'Edit(./.git/**)',
    // the install's own secrets and database (`//` is an absolute path in a permission rule)
    ...(dataDir
      ? ['secrets.json', 'server.json', 'db/**', 'mcp/**', 'mcp-approved/**'].flatMap((name) => {
          const path = `//${join(dataDir, name).replace(/^\/+/, '')}`
          return [`Read(${path})`, `Edit(${path})`]
        })
      : []),
  ]
  return { allowed, denied }
}

const mcpConfigPath = (env: WorkerEnv, project: Project) =>
  join(env.dataDir, 'mcp', `${project.slug}.json`)

/** kammacron (with this run's own token) and the project's servers that Settings turned on. */
const writeMcpConfig = async (env: WorkerEnv, project: Project, dir: string, token: string) => {
  const own = await approvedServers(env.dataDir, project, dir)
  if (own.changed.length > 0)
    await addAlert(env.db, {
      level: 'warning',
      project_id: project.id,
      message: `${project.name}: .mcp.json changed what ${own.changed.join(', ')} runs; left out until you save the project's MCP servers again`,
    })
  const servers: Record<string, McpServer> = {
    kammacron: {
      type: 'http',
      url: `${env.serverUrl()}/mcp`,
      headers: { Authorization: `Bearer ${token}` },
    },
    ...own.servers,
  }
  const path = mcpConfigPath(env, project)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify({ mcpServers: servers }, null, 2), { mode: 0o600 })
  return { path, servers: Object.keys(own.servers) }
}

/** The token of a run that is going (never the owner's). */
const runTokenOf = (env: WorkerEnv, runId: number) =>
  [...env.runTokens].find(([, scope]) => scope.runId === runId)?.[0] ?? ''

/** Every string a run's output must not carry. */
const secretsOf = (env: WorkerEnv, runId: number) =>
  [env.apiToken(), env.claudeToken() ?? '', runTokenOf(env, runId)].filter(Boolean)

type Attachment = { filename: string; path: string }

/**
 * The run's own folder, outside the project: the card as markdown (for run steps) and its
 * attached files (for Claude). Gone when the run ends; the project directory is never written to.
 */
const prepareRunDir = async (env: WorkerEnv, runId: number, cardId: number) => {
  const dir = join(env.dataDir, 'runs', String(runId))
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const full = await getCard(env.db, cardId)
  const rows = await cardAttachments(env.db, cardId)
  const attachments: Attachment[] = []
  if (rows.length > 0) await mkdir(join(dir, 'attachments'))
  for (const row of rows) {
    const name = `${row.id.slice(0, 8)}-${row.filename.replace(/[^\w.-]/g, '_')}`
    const path = join(dir, 'attachments', name)
    await copyFile(attachmentPath(join(env.dataDir, 'files'), row), path)
    attachments.push({ filename: row.filename, path })
  }
  const cardFile = join(dir, 'card.md')
  await writeFile(
    cardFile,
    [
      `# #${String(full.id)} ${full.title}`,
      '',
      full.body.trim(),
      ...full.comments.map(
        (c) =>
          `\n## ${c.author} (${new Date(c.created_at).toISOString()})\n\n    ${indented(c.body)}`,
      ),
      '',
    ].join('\n'),
  )
  return { dir, cardFile, attachments }
}

export type CardOutcome = {
  run: Run | null
  /** Why a Claude step ended early (auth and usage limits end the project's round). */
  errorKind?: ClaudeResult['errorKind']
  skipped?: string
}

/** Moves the card back to todo after a run that did not get to work, counting it as stale. */
const returnCard = async (
  env: WorkerEnv,
  cardId: number,
  countStale: boolean,
  staleReason: string,
) => {
  const [card] = await env.db.select().from(cards).where(eq(cards.id, cardId))
  if (card?.status !== 'doing') return
  const staleCount = card.stale_count + (countStale ? 1 : 0)
  await env.db.update(cards).set({ stale_count: staleCount }).where(eq(cards.id, cardId))
  if (countStale && staleCount >= 2)
    await moveCard(env.db, cardId, {
      status: 'review',
      reason: `${staleReason} (twice; a person should look)`,
    })
  else await moveCard(env.db, cardId, { status: 'todo' })
}

/** The claim: a run row and the card's move to doing, together or not at all. */
const claim = async (env: WorkerEnv, project: Project, cardId: number, logDir: string) =>
  env.db
    .transaction(async (tx) => {
      const run = await createRun(tx, { project_id: project.id, card_id: cardId, log_path: null })
      const card = await claimCard(tx, cardId, run.id)
      if (!card) {
        tx.rollback()
        return null
      }
      return {
        run: await updateRun(tx, run.id, { log_path: join(logDir, `${String(run.id)}.jsonl`) }),
        card,
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('Rollback')) return null
      throw error
    })

/** Everything a step needs of the run it is in. */
type Context = {
  env: WorkerEnv
  project: Project
  card: Card
  dir: string
  run: Run
  steps: readonly PlaybookStep[]
  runDir: { dir: string; cardFile: string; attachments: Attachment[] }
  childEnvironment: Record<string, string>
  logFile: string
  staleMinutes: number
  /** Events so far (one sequence across the run's Claude steps). */
  seq: { value: number }
}

/** What a step printed (a run step), kept on its row. */
type Printed = { output?: string; exitCode?: number }

/** How a step ended, for the loop: go on, stop here, or the run is over already. */
type StepEnd = Printed &
  (
    | { next: true }
    | { handed: true }
    | { failed: string }
    | { interrupted: Run; errorKind: ClaudeResult['errorKind'] }
  )

/** Errors that are not the card's fault (token, usage limit, stop): the card goes back, untouched or counted. */
const settleInterrupted = async (
  ctx: Context,
  result: ClaudeResult,
  stoppedByUser: boolean,
): Promise<Run | null> => {
  const { env, project, card, run } = ctx
  if (result.errorKind === 'auth') {
    await updateSettings(env.db, { paused: true })
    await returnCard(env, card.id, false, '')
    const message =
      'Claude refused the token: the worker is paused. Set a new CLAUDE_CODE_OAUTH_TOKEN in Settings (claude setup-token), then resume.'
    await addAlert(env.db, { level: 'error', run_id: run.id, message })
    await env.notify('kammacron paused', message)
    return updateRun(env.db, run.id, { status: 'failed', ended_at: new Date() })
  }
  if (result.errorKind === 'rate_limit') {
    await returnCard(env, card.id, false, '')
    await env.db
      .update(projects)
      .set({ next_run_at: new Date(Date.now() + 60 * 60_000) })
      .where(eq(projects.id, project.id))
    await addAlert(env.db, {
      level: 'info',
      project_id: project.id,
      run_id: run.id,
      message: `${project.name}: usage limit reached; next try in an hour`,
    })
    return updateRun(env.db, run.id, { status: 'failed', ended_at: new Date() })
  }
  if (result.errorKind === 'stopped') return stopRun(ctx, stoppedByUser)
  return null
}

/** Stopped by hand, or past the stale time: the card back to todo, counted. */
const stopRun = async (ctx: Context, stoppedByUser: boolean) => {
  await returnCard(
    ctx.env,
    ctx.card.id,
    true,
    stoppedByUser ? 'stopped by hand' : `ran past ${String(ctx.staleMinutes)} minutes`,
  )
  return updateRun(ctx.env.db, ctx.run.id, {
    status: stoppedByUser ? 'stopped' : 'stale',
    ended_at: new Date(),
  })
}

/** Keeps the step reachable by Stop while it goes. */
const track = async <T>(ctx: Context, handle: { stop: () => void; result: Promise<T> }) => {
  const entry: RunHandle = { stop: handle.stop, stoppedByUser: false }
  ctx.env.handles.set(ctx.run.id, entry)
  const result = await handle.result.finally(() => ctx.env.handles.delete(ctx.run.id))
  return { result, stoppedByUser: entry.stoppedByUser }
}

/** Where a project writes its instructions for Claude, in the order they are given. */
const RULE_FILES = ['CLAUDE.md', '.claude/CLAUDE.md', '.claude-worker/prompt.md']

/**
 * The project's instructions. Claude Code would read CLAUDE.md itself, but only together with the
 * directory's settings, which a run does not load; so kammacron hands the files over.
 */
const projectRules = async (dir: string) => {
  const found: string[] = []
  for (const name of RULE_FILES) {
    const text = await readFile(join(dir, name), 'utf8').catch(() => '')
    if (text.trim()) found.push(`### ${name}\n${text.trim()}`)
  }
  return found.length > 0 ? found.join('\n\n') : null
}

const claudeArgs = async (ctx: Context, step: ClaudeStep, index: number) => {
  const { env, project, card, dir, run } = ctx
  const rules = await projectRules(dir)
  const mcp = await writeMcpConfig(env, project, dir, runTokenOf(env, run.id))
  const tools = toolLists(project, step, mcp.servers, env.dataDir)
  const model = step.model ?? project.model
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(step.max_turns ?? project.max_turns),
    '--allowedTools',
    tools.allowed.join(','),
    '--disallowedTools',
    tools.denied.join(','),
    '--mcp-config',
    mcp.path,
    '--strict-mcp-config',
    // nothing from the directory's .claude/: its hooks and apiKeyHelper would run commands here
    '--setting-sources',
    'user',
    ...(ctx.runDir.attachments.length > 0
      ? [`--add-dir=${join(ctx.runDir.dir, 'attachments')}`]
      : []),
    '--append-system-prompt',
    workerRules({
      project,
      cardId: card.id,
      projectRules: rules,
      attachmentsDir:
        ctx.runDir.attachments.length > 0 ? join(ctx.runDir.dir, 'attachments') : null,
      steps: ctx.steps,
      index,
    }),
    ...(model ? ['--model', model] : []),
  ]
}

/** Adds what this Claude step spent to the run (a playbook may have more than one). */
const recordClaude = (ctx: Context, result: ClaudeResult) =>
  updateRun(ctx.env.db, ctx.run.id, {
    num_turns: (ctx.run.num_turns ?? 0) + (result.numTurns ?? 0),
    cost_usd: (ctx.run.cost_usd ?? 0) + (result.costUsd ?? 0),
    usage: result.usage,
    session_id: result.sessionId,
    summary: result.summary,
    permission_denials: result.permissionDenials,
    exit_code: result.exitCode,
    error: result.error,
    error_kind: result.errorKind,
  })

/** One `claude -p` on the card: it goes on only when Claude moved the card to done. */
const claudeStep = async (ctx: Context, step: ClaudeStep, index: number): Promise<StepEnd> => {
  const { env, card } = ctx
  const full = await getCard(env.db, card.id)
  const prompt = taskPrompt({
    card,
    comments: full.comments,
    attachments: ctx.runDir.attachments,
    previousRuns: (await previousRuns(env.db, card.id)).filter((r) => r.id !== ctx.run.id),
    stepPrompt: step.prompt,
  })
  const handle = spawnClaude({
    bin: env.claudeBin,
    args: await claudeArgs(ctx, step, index),
    cwd: ctx.dir,
    env: ctx.childEnvironment,
    prompt,
    secrets: secretsOf(env, ctx.run.id),
    timeoutMs: ctx.staleMinutes * 60_000,
    onLine: (line) => appendFile(ctx.logFile, `${line}\n`),
    onEvent: async (event) => {
      ctx.seq.value += 1
      await addRunEvent(env.db, ctx.run.id, ctx.seq.value, event)
    },
  })
  const { result, stoppedByUser } = await track(ctx, handle)
  ctx.run = await recordClaude(ctx, result)
  const interrupted = await settleInterrupted(ctx, result, stoppedByUser)
  if (interrupted) return { interrupted, errorKind: result.errorKind }
  if (result.errorKind === 'max_turns') return { failed: `Claude hit max_turns before finishing` }
  if (result.errorKind)
    return { failed: `Claude ended with an error: ${result.error ?? result.errorKind}` }
  const [now] = await env.db.select().from(cards).where(eq(cards.id, card.id))
  const status = now?.status ?? 'doing'
  if (status === 'done') return { next: true }
  if (status === 'doing') return { failed: 'Claude ended without moving the card' }
  return { handed: true } // review, or todo with a question
}

/** A shell command in the project's directory, with the card in the environment. */
const runStep = async (ctx: Context, step: RunStep): Promise<StepEnd> => {
  const handle = spawnShell({
    command: step.command,
    cwd: ctx.dir,
    env: {
      ...ctx.childEnvironment,
      KAMMACRON_CARD_ID: String(ctx.card.id),
      KAMMACRON_CARD_TITLE: ctx.card.title,
      KAMMACRON_CARD_FILE: ctx.runDir.cardFile,
      KAMMACRON_RUN_ID: String(ctx.run.id),
      KAMMACRON_PROJECT_DIR: ctx.dir,
    },
    timeoutMs: (step.timeout_minutes ?? 15) * 60_000,
    secrets: secretsOf(ctx.env, ctx.run.id),
    onChunk: (text) =>
      appendFile(ctx.logFile, `${JSON.stringify({ type: 'step', name: step.name, text })}\n`),
  })
  const { result, stoppedByUser } = await track(ctx, handle)
  const printed = { output: result.output, exitCode: result.exitCode }
  if (result.stopped && !result.timedOut)
    return { interrupted: await stopRun(ctx, stoppedByUser), errorKind: 'stopped', ...printed }
  if (result.timedOut)
    return { failed: `timed out after ${String(step.timeout_minutes ?? 15)} minutes`, ...printed }
  if (result.exitCode !== 0 && !step.continue_on_error)
    return { failed: `exit ${String(result.exitCode)}`, ...printed }
  return { next: true, ...printed }
}

/** A failed step: the card to review with the step's name and what it printed last. */
const failCard = async (ctx: Context, step: PlaybookStep, reason: string, output?: string) => {
  const { env, card, run, project } = ctx
  const message = `step "${step.name}" failed: ${reason}`
  if (output?.trim())
    await addComment(env.db, card.id, {
      author: 'claude-worker',
      run_id: run.id,
      body: `The playbook stopped at **${step.name}** (${reason}).\n\n\`\`\`\n${output.trim().slice(-3000)}\n\`\`\``,
    })
  await moveCard(env.db, card.id, { status: 'review', reason: message })
  await env.notify(`#${String(card.id)} needs review`, `${project.name}: ${message}`)
  return updateRun(env.db, run.id, {
    status: 'failed',
    ended_at: new Date(),
    error: message,
    error_kind: ctx.run.error_kind ?? 'step',
  })
}

/** All steps passed: the card is done, whoever moved it there. */
const succeed = async (ctx: Context) => {
  const { env, card, run, steps } = ctx
  const [now] = await env.db.select().from(cards).where(eq(cards.id, card.id))
  if (now?.status === 'doing') {
    await addComment(env.db, card.id, {
      author: 'claude-worker',
      run_id: run.id,
      body: `The playbook passed: ${steps.map((s) => s.name).join(' → ')}.`,
    })
    await moveCard(env.db, card.id, { status: 'done' })
  }
  return updateRun(env.db, run.id, { status: 'succeeded', ended_at: new Date() })
}

/** A step as the run_steps table holds it. */
const stepRow = (step: PlaybookStep, position: number) => ({
  position,
  kind: step.kind,
  name: step.name,
  command: step.kind === 'run' ? step.command : null,
})

/** A person has the card now (review, or a question): the rest of the playbook waits. */
const handOver = async (ctx: Context) => {
  const [now] = await ctx.env.db.select().from(cards).where(eq(cards.id, ctx.card.id))
  const review = now?.status === 'review'
  if (review)
    await ctx.env.notify(
      `#${String(ctx.card.id)} needs review`,
      `${ctx.project.name}: ${ctx.card.title}`,
    )
  return updateRun(ctx.env.db, ctx.run.id, {
    status: review ? 'review' : 'succeeded',
    ended_at: new Date(),
  })
}

/** The playbook, step by step, until one stops it. */
const play = async (ctx: Context): Promise<CardOutcome> => {
  const { env, steps } = ctx
  for (const [index, step] of steps.entries()) {
    const row = await startStep(env.db, { run_id: ctx.run.id, ...stepRow(step, index) })
    const end =
      step.kind === 'claude' ? await claudeStep(ctx, step, index) : await runStep(ctx, step)
    const status = 'interrupted' in end ? 'stopped' : 'failed' in end ? 'failed' : 'succeeded'
    await endStep(env.db, row.id, {
      status,
      exit_code: end.exitCode ?? null,
      output: end.output ?? null,
    })
    if ('next' in end) continue
    const rest = steps.slice(index + 1).map((s, i) => stepRow(s, index + 1 + i))
    await skipSteps(env.db, ctx.run.id, rest)
    if ('interrupted' in end) return { run: end.interrupted, errorKind: end.errorKind }
    if ('failed' in end) return { run: await failCard(ctx, step, end.failed, end.output) }
    return { run: await handOver(ctx) }
  }
  return { run: await succeed(ctx) }
}

/**
 * One card, one run of the project's playbook, one row of `runs`. The directory is the project's
 * own: kammacron neither prepares nor checks it; the steps (and the project's instructions) do.
 */
export const runCard = async (
  env: WorkerEnv,
  project: Project,
  cardId: number,
): Promise<CardOutcome> => {
  const dir = project.repo_path
  if (!dir) return { run: null, skipped: 'no directory' }
  if (!(await isDir(dir))) return { run: null, skipped: `the directory ${dir} does not exist` }
  const logDir = join(env.dataDir, 'logs', 'runs')
  await mkdir(logDir, { recursive: true, mode: 0o700 })
  const claimed = await claim(env, project, cardId, logDir)
  if (!claimed) return { run: null, skipped: 'claimed by someone else' }
  const { run, card } = claimed
  const chosen = playbookOf(project, card)
  if (!chosen) return { run: await noPlaybook(env, project, card, run) }
  const runDir = await prepareRunDir(env, run.id, card.id)
  const token = newToken()
  env.runTokens.set(token, { runId: run.id, cardId: card.id })
  try {
    return await play({
      env,
      project,
      card,
      dir,
      run,
      steps: chosen.steps,
      runDir,
      childEnvironment: await childEnv(env),
      logFile: run.log_path ?? join(logDir, `${String(run.id)}.jsonl`),
      staleMinutes: (await getSettings(env.db)).stale_minutes,
      seq: { value: 0 },
    })
  } finally {
    env.runTokens.delete(token)
    await rm(mcpConfigPath(env, project), { force: true })
    await rm(runDir.dir, { recursive: true, force: true })
  }
}

/** The card's `playbook:<name>` tag names the playbook; without one, `default`. */
const playbookOf = (project: Project, card: Card) => {
  const tag = card.tags.find((t) => t.startsWith(PLAYBOOK_TAG))
  const name = tag ? tag.slice(PLAYBOOK_TAG.length) : DEFAULT_PLAYBOOK_NAME
  const playbooks = project.playbooks.length > 0 ? project.playbooks : DEFAULT_PLAYBOOKS
  return playbooks.find((p) => p.name === name) ?? null
}

/** A tag naming a playbook the project lacks: nothing runs, a person fixes the tag. */
const noPlaybook = async (env: WorkerEnv, project: Project, card: Card, run: Run) => {
  const tag = card.tags.find((t) => t.startsWith(PLAYBOOK_TAG)) ?? ''
  const reason = `${project.name} has no playbook "${tag.slice(PLAYBOOK_TAG.length)}" (tag ${tag})`
  await moveCard(env.db, card.id, { status: 'review', reason })
  return updateRun(env.db, run.id, {
    status: 'failed',
    ended_at: new Date(),
    error: reason,
    error_kind: 'step',
  })
}

const isDir = async (path: string) =>
  (await Bun.spawn(['test', '-d', path], { stdout: 'ignore', stderr: 'ignore' }).exited) === 0

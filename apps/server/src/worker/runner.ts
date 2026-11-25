import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { eq } from 'drizzle-orm'

import { cards, projects } from '../db/schema'
import { addAlert } from '../services/alerts'
import { attachmentPath, cardAttachments } from '../services/attachments'
import { addComment, claimCard, getCard, moveCard, type Card } from '../services/cards'
import type { Project } from '../services/projects'
import { addRunEvent, createRun, getRun, previousRuns, updateRun, type Run } from '../services/runs'
import { getSettings, updateSettings } from '../services/settings'
import { spawnClaude, type ClaudeResult } from './claude'
import { cardBranch, childEnv, type WorkerEnv } from './env'
import { checkGate, isGated, shipBranch } from './gate'
import { defaultBranch, exclude, exec, gitIn, hashFiles, remoteHeads, type Git } from './git'
import { taskPrompt, workerRules } from './prompt'
import { verifyAndRevert } from './verify'

export const worktreeDir = (env: WorkerEnv, project: Project) =>
  project.worktree_path ?? join(env.dataDir, 'worktrees', project.slug)

const pathExists = async (path: string) => {
  const r = await exec(['test', '-e', path], { cwd: '/' })
  return r.code === 0
}

/** Makes the project's worktree on first use; later, only checks it is still one. */
export const ensureWorktree = async (repo: Git, dir: string, branch: string) => {
  await repo.run('worktree', 'prune')
  if (await pathExists(join(dir, '.git'))) return gitIn(dir, {})
  await mkdir(dirname(dir), { recursive: true })
  await repo.out('fetch', 'origin', '--prune')
  await repo.out('worktree', 'add', '--detach', dir, `origin/${branch}`)
  return gitIn(dir, {})
}

/** Exact tools: anything not listed is refused (spike S3: compound commands are split and checked). */
export const toolLists = (
  project: Project,
  defaultBranchName: string,
  cardId: number,
  mcpServers: readonly string[],
) => {
  const branch = cardBranch(cardId)
  const allowed = [
    'Read',
    'Edit',
    'Write',
    'Glob',
    'Grep',
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
      'rebase',
      'restore',
      'rev-parse',
      'stash',
      'merge-base',
      'ls-files',
      'blame',
    ].map((cmd) => `Bash(git ${cmd}:*)`),
    'Bash(git branch --show-current)',
    `Bash(git push origin HEAD:${branch})`,
    ...(project.ship_policy === 'push' && !isGated(project)
      ? [`Bash(git push origin HEAD:${defaultBranchName})`]
      : []),
    ...project.allowed_bash,
    ...(project.web_tools ? ['WebSearch', 'WebFetch'] : []),
  ]
  const denied = [
    'Bash(git push --force:*)',
    'Bash(git push -f:*)',
    'Bash(git push --force-with-lease:*)',
    'Bash(git push --no-verify:*)',
    'Bash(git commit --no-verify:*)',
    'Bash(git commit -n:*)',
    'Bash(git reset --hard:*)',
    'Bash(git clean:*)',
    'Bash(git filter-branch:*)',
    'Bash(git branch -D:*)',
    'Bash(git config:*)',
    'Bash(git remote:*)',
    'Bash(git -c:*)',
  ]
  return { allowed, denied }
}

type McpServer = Record<string, unknown>

/** kammacron (with this run's id) and the project's own servers that Settings turned on. */
const writeMcpConfig = async (
  env: WorkerEnv,
  project: Project,
  worktree: string,
  runId: number,
) => {
  const servers: Record<string, McpServer> = {
    kammacron: {
      type: 'http',
      url: `${env.serverUrl()}/mcp`,
      headers: { Authorization: `Bearer ${env.apiToken()}`, 'X-Kammacron-Run': String(runId) },
    },
  }
  const own: Record<string, McpServer> = await readFile(join(worktree, '.mcp.json'), 'utf8')
    .then(
      (text) => (JSON.parse(text) as { mcpServers?: Record<string, McpServer> }).mcpServers ?? {},
    )
    .catch(() => ({}))
  const enabled: string[] = []
  for (const name of project.enabled_mcp_servers) {
    const server = own[name]
    if (name === 'kammacron' || !server) continue
    servers[name] = server
    enabled.push(name)
  }
  const path = join(env.dataDir, 'mcp', `${project.slug}.json`)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify({ mcpServers: servers }, null, 2), { mode: 0o600 })
  return { path, servers: enabled }
}

const prepareBranch = async (
  wt: Git,
  defaultBranchName: string,
  card: Card,
  heads: Record<string, string>,
) => {
  const branch = cardBranch(card.id)
  await wt.out('fetch', 'origin', '--prune')
  // a card sent back continues on the branch its earlier run left
  const resume = card.branch === branch && heads[branch] !== undefined
  await wt.out(
    'checkout',
    '-f',
    '-B',
    branch,
    resume ? `origin/${branch}` : `origin/${defaultBranchName}`,
  )
  await wt.out('clean', '-fd') // ignored files (node_modules, .kammacron/) stay
  return resume
}

const copyProjectFiles = async (repoPath: string, worktree: string, files: readonly string[]) => {
  for (const name of files) {
    const from = join(repoPath, name)
    if (!(await Bun.file(from).exists())) continue
    await mkdir(dirname(join(worktree, name)), { recursive: true })
    await copyFile(from, join(worktree, name))
  }
}

/** `setup_command` the first time, and again whenever a lock file changed. */
const setup = async (env: WorkerEnv, project: Project, worktree: string) => {
  if (!project.setup_command) return null
  const hash = await hashFiles(worktree, project.lock_files)
  if (hash === project.setup_hash) return null
  const r = await exec(['sh', '-c', project.setup_command], {
    cwd: worktree,
    env: await childEnv(env),
    timeoutMs: 15 * 60_000,
  })
  if (r.code !== 0)
    return `setup_command failed (exit ${String(r.code)}): ${(r.stderr || r.stdout).trim().slice(-1500)}`
  await env.db.update(projects).set({ setup_hash: hash }).where(eq(projects.id, project.id))
  return null
}

const copyAttachments = async (env: WorkerEnv, cardId: number, worktree: string) => {
  const dir = join(worktree, '.kammacron', 'attachments')
  await rm(dir, { recursive: true, force: true })
  const rows = await cardAttachments(env.db, cardId)
  if (rows.length === 0) return []
  await mkdir(dir, { recursive: true })
  const out: { filename: string; path: string }[] = []
  for (const row of rows) {
    const name = `${row.id.slice(0, 8)}-${row.filename.replace(/[^\w.-]/g, '_')}`
    await copyFile(attachmentPath(join(env.dataDir, 'files'), row), join(dir, name))
    out.push({ filename: row.filename, path: `.kammacron/attachments/${name}` })
  }
  return out
}

export type CardOutcome = { run: Run | null; result: ClaudeResult | null; skipped?: string }

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

type Stage = {
  env: WorkerEnv
  project: Project
  card: Card
  wt: Git
  dir: string
  branchName: string
  before: Record<string, string>
  baseSha: string | null
}

const failRun = (env: WorkerEnv, runId: number, message: string, kind: string) =>
  updateRun(env.db, runId, {
    status: 'failed',
    ended_at: new Date(),
    error: message,
    error_kind: kind,
  })

/** The claim: a run row and the card's move to doing, together or not at all. */
const claim = async (
  env: WorkerEnv,
  project: Project,
  cardId: number,
  baseSha: string | null,
  logDir: string,
) =>
  env.db
    .transaction(async (tx) => {
      const run = await createRun(tx, {
        project_id: project.id,
        card_id: cardId,
        base_sha: baseSha,
        log_path: null,
      })
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

/** Branch, project files, setup and attachments; a failure ends the run here. */
const prepare = async (stage: Stage, run: Run) => {
  const { env, project, card, wt, dir } = stage
  try {
    const resume = await prepareBranch(wt, stage.branchName, card, stage.before)
    await copyProjectFiles(project.repo_path ?? '', dir, project.copy_files)
    const setupError = await setup(env, project, dir)
    if (setupError) {
      await failRun(env, run.id, setupError, 'setup')
      await moveCard(env.db, card.id, { status: 'review', reason: setupError })
      await addAlert(env.db, {
        level: 'error',
        project_id: project.id,
        card_id: card.id,
        run_id: run.id,
        message: `${project.name}: ${setupError.slice(0, 200)}`,
      })
      return null
    }
    return { resume, attachments: await copyAttachments(env, card.id, dir) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failRun(env, run.id, `preparing the worktree: ${message}`, 'setup')
    await returnCard(env, card.id, false, '')
    await addAlert(env.db, {
      level: 'error',
      project_id: project.id,
      run_id: run.id,
      message: `${project.name}: preparing the worktree failed: ${message.slice(0, 300)}`,
    })
    return null
  }
}

/** The command line and the prompt of the run. */
const invocation = async (
  stage: Stage,
  run: Run,
  prepared: { resume: boolean; attachments: { filename: string; path: string }[] },
) => {
  const { env, project, card, dir, branchName } = stage
  const full = await getCard(env.db, card.id)
  const rules = await readFile(join(dir, '.claude-worker', 'prompt.md'), 'utf8').catch(() => null)
  const mcp = await writeMcpConfig(env, project, dir, run.id)
  const tools = toolLists(project, branchName, card.id, mcp.servers)
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(project.max_turns),
    '--allowedTools',
    tools.allowed.join(','),
    '--disallowedTools',
    tools.denied.join(','),
    '--mcp-config',
    mcp.path,
    '--strict-mcp-config',
    '--append-system-prompt',
    workerRules({ project, defaultBranch: branchName, cardId: card.id, projectRules: rules }),
    ...(project.model ? ['--model', project.model] : []),
  ]
  const prompt = taskPrompt({
    card,
    comments: full.comments,
    attachments: prepared.attachments,
    previousRuns: (await previousRuns(env.db, card.id)).filter((r) => r.id !== run.id),
    defaultBranch: branchName,
    resumingBranch: prepared.resume,
  })
  return { args, prompt }
}

/** Errors that are not the card's fault (token, usage limit, stop): the card goes back, untouched or counted. */
const settleInterrupted = async (
  stage: Stage,
  run: Run,
  result: ClaudeResult,
  stoppedByUser: boolean,
  staleMinutes: number,
): Promise<Run | null> => {
  const { env, project, card } = stage
  if (result.errorKind === 'auth') {
    await updateSettings(env.db, { paused: true })
    await returnCard(env, card.id, false, '')
    const message =
      'Claude refused the token: the worker is paused. Set a new CLAUDE_CODE_OAUTH_TOKEN in Settings (claude setup-token), then resume.'
    await addAlert(env.db, { level: 'error', run_id: run.id, message })
    await env.notify('kammacron paused', message)
    return updateRun(env.db, run.id, { status: 'failed' })
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
    return updateRun(env.db, run.id, { status: 'failed' })
  }
  if (result.errorKind === 'stopped') {
    await returnCard(
      env,
      card.id,
      true,
      stoppedByUser ? 'stopped by hand' : `ran past ${String(staleMinutes)} minutes`,
    )
    return updateRun(env.db, run.id, { status: stoppedByUser ? 'stopped' : 'stale' })
  }
  return null
}

/** What really reached the remote: the run's commits, where they went, and refs it may not touch. */
const inspectRemote = async (stage: Stage) => {
  const { wt, project, card, branchName, before, baseSha } = stage
  await wt.run('fetch', 'origin', '--prune')
  const after = await remoteHeads(wt)
  const branch = cardBranch(card.id)
  const headSha = (await wt.out('rev-parse', 'HEAD')) || null
  const commits = baseSha
    ? (await wt.out('rev-list', '--reverse', `${baseSha}..HEAD`)).split('\n').filter(Boolean)
    : []
  const defaultTip = after[branchName]
  const onDefault =
    headSha !== null &&
    defaultTip !== undefined &&
    commits.length > 0 &&
    (await wt.run('merge-base', '--is-ancestor', headSha, defaultTip)).code === 0
  const onBranch = after[branch] !== undefined && after[branch] === headSha
  const allowedRefs = new Set([
    branch,
    ...(project.ship_policy === 'push' && !isGated(project) ? [branchName] : []),
  ])
  // a ref counts as the run's only when it now holds one of the run's commits: the owner may push
  // their own branches while a run goes
  const first = commits[0]
  const outside: string[] = []
  for (const ref of Object.keys({ ...before, ...after })) {
    const sha = after[ref]
    if (before[ref] === sha || allowedRefs.has(ref) || !sha || first === undefined) continue
    if (sha === headSha || (await wt.run('merge-base', '--is-ancestor', first, sha)).code === 0)
      outside.push(ref)
  }
  return {
    headSha,
    commits,
    onDefault,
    onBranch,
    branch,
    outside,
    pushedTo: onDefault ? branchName : onBranch ? branch : null,
  }
}

/** The card as the run left it: still doing, or done without its commits on main, goes to review. */
const settleCard = async (
  stage: Stage,
  result: ClaudeResult,
  remote: { commits: string[]; onDefault: boolean; onBranch: boolean },
) => {
  const { env, project, card, branchName } = stage
  const [now] = await env.db.select().from(cards).where(eq(cards.id, card.id))
  const status = now?.status ?? 'doing'
  if (status === 'doing') {
    const reason =
      result.errorKind === 'max_turns'
        ? `the run hit max_turns (${String(project.max_turns)}) before finishing`
        : 'the run ended without moving the card'
    await moveCard(env.db, card.id, { status: 'review', reason })
    return 'review'
  }
  const shipped = isGated(project) ? remote.onBranch : remote.onDefault
  if (status === 'done' && remote.commits.length > 0 && !shipped) {
    const where = isGated(project) ? `origin/${cardBranch(card.id)}` : `origin/${branchName}`
    await moveCard(env.db, card.id, {
      status: 'review',
      reason: `the card was moved to done, but its commits are not on ${where}`,
    })
    return 'review'
  }
  return status
}

/** The diff gate, then the push on: the new tip and its commits, or null (the card went to review). */
const throughGate = async (stage: Stage, run: Run, base: string, head: string) => {
  const { env, project, card, wt, branchName } = stage
  const verdict = await checkGate(wt, project, base, head)
  if (!verdict.ok) {
    await moveCard(env.db, card.id, {
      status: 'review',
      reason: `held at the gate: ${verdict.reason ?? ''}`,
    })
    return null
  }
  try {
    const sha = await shipBranch(wt, await childEnv(env), cardBranch(card.id), branchName)
    const commits = (await wt.out('rev-list', '--reverse', `${base}..${sha}`))
      .split('\n')
      .filter(Boolean)
    await addComment(env.db, card.id, {
      author: 'claude-worker',
      run_id: run.id,
      body: `Passed the gate (${String(verdict.lines)} lines, ${String(verdict.files.length)} files): kammacron pushed ${cardBranch(card.id)} to ${branchName} at ${sha.slice(0, 8)}.`,
    })
    return { sha, commits }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await moveCard(env.db, card.id, {
      status: 'review',
      reason: `passed the gate, but the push on failed: ${message.slice(0, 500)}`,
    })
    return null
  }
}

const pauseForRefs = async (stage: Stage, run: Run, outside: string[]) => {
  const { env, project, card } = stage
  const reason = `run ${String(run.id)} changed refs it may not push: ${outside.join(', ')}`
  await env.db.update(projects).set({ paused_reason: reason }).where(eq(projects.id, project.id))
  await addAlert(env.db, {
    level: 'error',
    project_id: project.id,
    card_id: card.id,
    run_id: run.id,
    message: `${project.name} paused: ${reason}`,
  })
  await env.notify('kammacron paused a project', `${project.name}: ${reason}`)
}

/** Where a run starts: the default branch, the worktree, and the remote's heads before it. */
const openStage = async (env: WorkerEnv, project: Project & { repo_path: string }) => {
  const childEnvironment = await childEnv(env)
  const repo = gitIn(project.repo_path, childEnvironment)
  const branchName = project.default_branch ?? (await defaultBranch(repo))
  if (!branchName) {
    await addAlert(env.db, {
      level: 'error',
      project_id: project.id,
      message: `${project.name}: cannot find the default branch (origin/HEAD)`,
    })
    return null
  }
  const dir = worktreeDir(env, project)
  const wt = gitIn((await ensureWorktree(repo, dir, branchName)).cwd, childEnvironment)
  await exclude(wt, ['.kammacron/'])
  const before = await remoteHeads(wt)
  return { childEnvironment, branchName, dir, wt, before, baseSha: before[branchName] ?? null }
}

/** After a clean end: what reached the remote, the card's state, the gate, then verify. */
const finish = async (stage: Stage, started: Run, result: ClaudeResult): Promise<Run> => {
  const { env, project, card, baseSha, branchName } = stage
  const remote = await inspectRemote(stage)
  let run = await updateRun(env.db, started.id, {
    head_sha: remote.headSha,
    commits: remote.commits,
    pushed_to: remote.pushedTo,
  })
  if (remote.onBranch)
    await env.db.update(cards).set({ branch: remote.branch }).where(eq(cards.id, card.id))
  if (remote.outside.length > 0) await pauseForRefs(stage, run, remote.outside)

  let status = await settleCard(stage, result, remote)
  let shipped = { sha: remote.headSha, commits: remote.commits, onDefault: remote.onDefault }
  // gated: kammacron checks the diff, then rebases claude/<card> and pushes it on itself
  if (status === 'done' && isGated(project) && remote.onBranch && remote.headSha && baseSha) {
    const passed = await throughGate(stage, run, baseSha, remote.headSha)
    if (passed) {
      shipped = { ...passed, onDefault: true }
      run = await updateRun(env.db, run.id, {
        pushed_to: branchName,
        head_sha: passed.sha,
        commits: passed.commits,
      })
    } else status = 'review'
  }
  run = await updateRun(env.db, run.id, {
    status: status === 'review' ? 'review' : result.errorKind ? 'failed' : 'succeeded',
  })
  if (status === 'review')
    await env.notify(`#${String(card.id)} needs review`, `${project.name}: ${card.title}`)
  if (
    status !== 'done' ||
    !shipped.onDefault ||
    !project.verify_command ||
    !shipped.sha ||
    !baseSha
  )
    return run
  return verifyAndRevert(env, {
    project,
    run,
    cardId: card.id,
    git: stage.wt,
    defaultBranch: branchName,
    baseSha,
    headSha: shipped.sha,
    commits: shipped.commits,
  })
}

/**
 * One card, one `claude -p`, one row of `runs`. Steps 4 to 6 of a project's round: worktree,
 * claim, run, then check what really happened (the card's status, what reached the remote).
 */
export const runCard = async (
  env: WorkerEnv,
  project: Project,
  cardId: number,
): Promise<CardOutcome> => {
  const repoPath = project.repo_path
  if (!repoPath) return { run: null, result: null, skipped: 'no repo' }
  const opened = await openStage(env, { ...project, repo_path: repoPath })
  if (!opened) return { run: null, result: null, skipped: 'no default branch' }
  const logDir = join(env.dataDir, 'logs', 'runs')
  await mkdir(logDir, { recursive: true, mode: 0o700 })
  const claimed = await claim(env, project, cardId, opened.baseSha, logDir)
  if (!claimed) return { run: null, result: null, skipped: 'claimed by someone else' }
  const stage: Stage = { env, project, card: claimed.card, ...opened }
  let run = claimed.run

  const prepared = await prepare(stage, run)
  if (!prepared) return { run: await getRun(env.db, run.id), result: null }
  const { args, prompt } = await invocation(stage, run, prepared)
  const settings = await getSettings(env.db)

  let seq = 0
  const logFile = run.log_path ?? join(logDir, `${String(run.id)}.jsonl`)
  const handle = spawnClaude({
    bin: env.claudeBin,
    args,
    cwd: stage.dir,
    env: opened.childEnvironment,
    prompt,
    secrets: [env.apiToken(), env.claudeToken() ?? ''].filter(Boolean),
    timeoutMs: settings.stale_minutes * 60_000,
    onLine: (line) => appendFile(logFile, `${line}\n`),
    onEvent: async (event) => {
      seq += 1
      await addRunEvent(env.db, run.id, seq, event)
    },
  })
  const entry = { ...handle, stoppedByUser: false }
  env.handles.set(run.id, entry)
  const result = await handle.result.finally(() => env.handles.delete(run.id))

  run = await updateRun(env.db, run.id, {
    ended_at: new Date(),
    num_turns: result.numTurns,
    cost_usd: result.costUsd,
    usage: result.usage,
    session_id: result.sessionId,
    summary: result.summary,
    permission_denials: result.permissionDenials,
    exit_code: result.exitCode,
    error: result.error,
    error_kind: result.errorKind,
  })
  const interrupted = await settleInterrupted(
    stage,
    run,
    result,
    entry.stoppedByUser,
    settings.stale_minutes,
  )
  if (interrupted) return { run: interrupted, result }

  return { run: await finish(stage, run, result), result }
}

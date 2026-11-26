import { appendFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { schedules } from '../db/schema'
import { newToken } from '../secrets'
import { claudeAgents, type ClaudeAgent } from '../services/agents'
import { addAlert } from '../services/alerts'
import { autopilotCards } from '../services/cards'
import type { Project } from '../services/projects'
import { addRunEvent, createRun, endStep, startStep, updateRun, type Run } from '../services/runs'
import { getSettings } from '../services/settings'
import { spawnClaude, type AgentSpawn, type ClaudeResult } from './claude'
import { spawnCodex } from './codex'
import { childEnv, claudeHeld, holdClaude, type WorkerEnv } from './env'
import { agentPrompt, agentRules } from './prompt'
import {
  isDir,
  mcpConfigPath,
  projectRules,
  secretsOf,
  toolLists,
  trackRun,
  writeMcpConfig,
} from './runner'

type Schedule = typeof schedules.$inferSelect

/** How an agent schedule's time ended: the run it made, or why it made none. */
export type AgentOutcome = { run: Run | null; result: string }

/** What a spawn needs beyond the agent's own arguments. */
type Common = Omit<AgentSpawn, 'bin' | 'args'>

/**
 * The schedule's Claude Code agent, read by kammacron itself: Claude runs without the project's
 * settings (`--setting-sources user`) and would not find a project's agent. Null when the schedule
 * names none; it throws when the agent is gone, and the run fails saying so.
 */
const scheduleAgent = async (schedule: Schedule, dir: string) => {
  if (!schedule.claude_agent) return null
  const agent = (await claudeAgents(dir)).find((a) => a.name === schedule.claude_agent)
  if (!agent) throw new Error(`no Claude Code agent "${schedule.claude_agent}" any more`)
  return agent
}

/**
 * An agent as `--agents` takes it. One that names its tools gets the board's MCP (and the
 * approved servers') too, or it could not reach the board.
 */
const agentsJson = (agent: ClaudeAgent, servers: readonly string[], model: string | null) => {
  const tools = agent.tools && [
    ...agent.tools,
    'mcp__kammacron',
    ...servers.map((name) => `mcp__${name}`),
  ]
  return JSON.stringify({
    [agent.name]: {
      description: agent.description || agent.name,
      prompt: agent.prompt,
      ...(tools ? { tools } : {}),
      ...(model ? { model } : {}),
    },
  })
}

/**
 * `claude -p` with the schedule's prompt, the worker's tool allowlist and the board's MCP; as the
 * schedule's Claude Code agent when it names one. The model is the schedule's, else the agent's,
 * else the project's.
 */
const claudeSpawn = async (
  env: WorkerEnv,
  project: Project,
  schedule: Schedule,
  dir: string,
  token: string,
  rules: string,
  common: Common,
) => {
  const mcp = await writeMcpConfig(env, project, dir, token)
  const tools = toolLists(
    project,
    { kind: 'claude', name: schedule.name },
    mcp.servers,
    env.dataDir,
  )
  const agent = await scheduleAgent(schedule, dir)
  const model = schedule.model ?? agent?.model ?? project.model
  return spawnClaude({
    ...common,
    bin: env.claudeBin,
    args: [
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
      '--setting-sources',
      'user',
      '--append-system-prompt',
      rules,
      ...(agent ? ['--agents', agentsJson(agent, mcp.servers, model), '--agent', agent.name] : []),
      ...(model ? ['--model', model] : []),
    ],
  })
}

/** A TOML string for `codex -c key=value` (JSON's string syntax is TOML's basic string). */
const toml = (value: string) => JSON.stringify(value)

/**
 * `codex exec` in the project directory: its sandbox may write the directory only, it never stops
 * to ask, and it reaches the board through kammacron's MCP with the run's own token.
 */
const codexSpawn = (
  env: WorkerEnv,
  schedule: Schedule,
  dir: string,
  token: string,
  rules: string,
  common: Common,
) =>
  spawnCodex({
    ...common,
    // Codex has no flag for more system prompt: the rules go first in the prompt
    prompt: `${rules}\n\n${common.prompt}`,
    env: { ...common.env, KAMMACRON_RUN_TOKEN: token },
    bin: env.codexBin,
    args: [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--cd',
      dir,
      '--sandbox',
      'workspace-write',
      '-c',
      `approval_policy=${toml('never')}`,
      '-c',
      `mcp_servers.kammacron.url=${toml(`${env.serverUrl()}/mcp`)}`,
      '-c',
      `mcp_servers.kammacron.bearer_token_env_var=${toml('KAMMACRON_RUN_TOKEN')}`,
      ...(schedule.model ? ['--model', schedule.model] : []),
      '-', // the prompt is on stdin
    ],
  })

/** Claude's sign-in or usage limit: its schedules wait an hour, as its cards do. */
const holdIfClaude = async (
  env: WorkerEnv,
  project: Project,
  schedule: Schedule,
  r: ClaudeResult,
) => {
  if (schedule.agent !== 'claude') return
  if (r.errorKind === 'auth') holdClaude(env, 'Claude is not signed in')
  if (r.errorKind === 'rate_limit') holdClaude(env, 'Claude usage limit reached')
  if (r.errorKind === 'auth' || r.errorKind === 'rate_limit')
    await addAlert(env.db, {
      level: 'warning',
      project_id: project.id,
      message: `${project.name}: schedule "${schedule.name}": ${r.error ?? r.errorKind}`,
    })
}

const statusOf = (r: ClaudeResult, stoppedByUser: boolean): Run['status'] => {
  if (r.errorKind === 'stopped') return stoppedByUser ? 'stopped' : 'stale'
  return r.errorKind ? 'failed' : 'succeeded'
}

/**
 * One time of an agent schedule: Claude or Codex in the project directory with the schedule's
 * prompt, as one run with one step and no card of its own. With `use_board`, the prompt carries
 * the open auto-pilot cards and how to take one; the board's MCP tools are there either way, so
 * a prompt can ask for the board in its own words.
 */
export const runAgentSchedule = async (
  env: WorkerEnv,
  project: Project,
  schedule: Schedule,
): Promise<AgentOutcome> => {
  const agent = schedule.agent ?? 'claude'
  const dir = project.repo_path
  if (!dir) return { run: null, result: 'skipped: no directory' }
  if (!(await isDir(dir))) return { run: null, result: `skipped: ${dir} does not exist` }
  const held = agent === 'claude' ? claudeHeld(env) : null
  if (held) return { run: null, result: `waits: ${held}` }

  const logDir = join(env.dataDir, 'logs', 'runs')
  await mkdir(logDir, { recursive: true, mode: 0o700 })
  const created = await createRun(env.db, {
    project_id: project.id,
    card_id: null,
    schedule_id: schedule.id,
    agent,
    log_path: null,
  })
  const logFile = join(logDir, `${String(created.id)}.jsonl`)
  let run = await updateRun(env.db, created.id, { log_path: logFile })
  const step = await startStep(env.db, {
    run_id: run.id,
    position: 0,
    kind: agent,
    name: schedule.name,
    command: null,
  })
  const token = newToken()
  env.runTokens.set(token, { runId: run.id, projectId: project.id })
  try {
    const rules = agentRules({
      project,
      scheduleName: schedule.name,
      projectRules: await projectRules(dir),
      useBoard: schedule.use_board,
    })
    let seq = 0
    const common: Common = {
      cwd: dir,
      env: await childEnv(env),
      prompt: agentPrompt({
        prompt: schedule.prompt ?? '',
        cards: schedule.use_board ? await autopilotCards(env.db, project.id) : null,
      }),
      secrets: secretsOf(env, run.id),
      timeoutMs: (await getSettings(env.db)).stale_minutes * 60_000,
      onLine: (line) => appendFile(logFile, `${line}\n`),
      onEvent: async (event) => {
        seq += 1
        await addRunEvent(env.db, run.id, seq, event)
      },
    }
    const handle =
      agent === 'codex'
        ? codexSpawn(env, schedule, dir, token, rules, common)
        : await claudeSpawn(env, project, schedule, dir, token, rules, common)
    const { result, stoppedByUser } = await trackRun(env, run.id, handle)
    await holdIfClaude(env, project, schedule, result)
    const status = statusOf(result, stoppedByUser)
    run = await updateRun(env.db, run.id, {
      status,
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
    await endStep(env.db, step.id, {
      status: status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : 'stopped',
      exit_code: result.exitCode,
    })
    if (status === 'failed')
      await env.notify(
        `${schedule.name} failed`,
        `${project.name}: run ${String(run.id)}, ${result.errorKind ?? 'error'}`,
      )
    return { run, result: `run ${String(run.id)} ${status}` }
  } catch (error) {
    // the executable is not there, or the directory went away under it
    const message = error instanceof Error ? error.message : String(error)
    run = await updateRun(env.db, run.id, {
      status: 'failed',
      ended_at: new Date(),
      error: `could not start ${agent}: ${message}`.slice(0, 2000),
      error_kind: 'crash',
    })
    await endStep(env.db, step.id, { status: 'failed' })
    return { run, result: `run ${String(run.id)} failed` }
  } finally {
    env.runTokens.delete(token)
    if (agent === 'claude') await rm(mcpConfigPath(env, project), { force: true })
  }
}

import {
  capped,
  clip,
  spawnJsonLines,
  SUMMARY_MAX,
  type AgentHandle,
  type AgentSpawn,
  type ClaudeResult,
  type RunEvent,
} from './claude'

/** One line of `codex exec --json`, as far as the worker reads it. */
type CodexLine = {
  type?: string
  thread_id?: string
  message?: string
  error?: { message?: string }
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number }
  item?: {
    type?: string
    text?: string
    command?: string
    aggregated_output?: string
    exit_code?: number | null
    status?: string
    server?: string
    tool?: string
    changes?: { path?: string; kind?: string }[]
  }
}

/** The events a `codex exec --json` line becomes: the same kinds a Claude run writes. */
export const codexEventsOf = (line: CodexLine): RunEvent[] => {
  const item = line.item
  switch (line.type) {
    case 'thread.started':
      return [{ type: 'system', summary: 'init', data: { thread_id: line.thread_id } }]
    case 'item.completed':
      if (!item) return []
      if (item.type === 'agent_message' && item.text?.trim())
        return [
          { type: 'assistant', summary: clip(item.text.trim(), SUMMARY_MAX), data: capped(item) },
        ]
      if (item.type === 'command_execution')
        return [
          {
            type: 'tool_use',
            summary: clip(`Bash ${item.command ?? ''}`, SUMMARY_MAX),
            data: capped({ command: item.command }),
          },
          {
            type: 'tool_result',
            summary: clip(
              `${item.exit_code ? 'error: ' : ''}${(item.aggregated_output ?? '').trim() || '(empty)'}`,
              SUMMARY_MAX,
            ),
            data: capped(item),
          },
        ]
      if (item.type === 'mcp_tool_call')
        return [
          {
            type: 'tool_use',
            summary: clip(`mcp__${item.server ?? ''}__${item.tool ?? ''}`, SUMMARY_MAX),
            data: capped(item),
          },
        ]
      if (item.type === 'file_change')
        return [
          {
            type: 'tool_use',
            summary: clip(
              `Edit ${(item.changes ?? []).map((c) => c.path ?? '').join(', ')}`,
              SUMMARY_MAX,
            ),
            data: capped(item),
          },
        ]
      return []
    case 'turn.failed':
    case 'error':
      return [
        {
          type: 'result',
          summary: clip(line.error?.message ?? line.message ?? 'error', SUMMARY_MAX),
          data: capped(line),
        },
      ]
    case undefined:
    default:
      return []
  }
}

/** Why a Codex run failed, from its error text and exit code. */
export const classifyCodex = (
  error: string | null,
  exitCode: number,
  stopped: boolean,
  completed: boolean,
): ClaudeResult['errorKind'] => {
  if (stopped) return 'stopped'
  const text = (error ?? '').toLowerCase()
  if (/401|unauthori[sz]ed|not logged in|login|authenticat/.test(text)) return 'auth'
  if (/429|rate.?limit|usage limit|quota/.test(text)) return 'rate_limit'
  if (error !== null || exitCode !== 0 || !completed) return 'crash'
  return null
}

/** Spawns `codex exec --json` with the prompt on stdin and reads its events, line by line. */
export const spawnCodex = (options: AgentSpawn): AgentHandle<ClaudeResult> => {
  let threadId: string | null = null
  let summary: string | null = null
  let usage: unknown = null
  let turns = 0
  let completed = false
  let error: string | null = null
  return spawnJsonLines<CodexLine, ClaudeResult>(options, {
    onJson: (line) => {
      if (line.type === 'thread.started') threadId = line.thread_id ?? null
      if (line.type === 'item.completed' && line.item?.type === 'agent_message')
        summary = line.item.text ?? summary
      if (line.type === 'turn.completed') {
        turns += 1
        completed = true
        usage = line.usage ?? null
      }
      if (line.type === 'turn.failed') error = line.error?.message ?? 'the turn failed'
      if (line.type === 'error') error = line.message ?? 'error'
    },
    eventsOf: codexEventsOf,
    finish: ({ exitCode, stderr, stopped }) => {
      const message = error ?? (exitCode !== 0 ? stderr.trim() || null : null)
      const errorKind = classifyCodex(message, exitCode, stopped, completed)
      return {
        exitCode,
        sessionId: threadId,
        summary,
        numTurns: turns,
        costUsd: null, // Codex reports tokens, not money
        usage,
        permissionDenials: [],
        isError: errorKind !== null,
        errorKind,
        error:
          errorKind === null
            ? null
            : clip(message ?? `codex exited with ${String(exitCode)}`, 2000),
        // Codex keeps its usage windows in its own session files (services/limits.ts)
        rateLimit: null,
      }
    },
  })
}

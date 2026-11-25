import type { RunEventType } from '../db/schema'

/** One line of `claude -p --output-format stream-json`, as far as the worker reads it. */
type StreamLine = {
  type?: string
  subtype?: string
  session_id?: string
  error?: string
  message?: { content?: unknown }
  result?: string
  is_error?: boolean
  api_error_status?: number | null
  terminal_reason?: string
  num_turns?: number
  total_cost_usd?: number
  usage?: unknown
  permission_denials?: unknown[]
}

type RunEvent = { type: RunEventType; summary: string; data: unknown }

export type ClaudeResult = {
  exitCode: number
  sessionId: string | null
  summary: string | null
  numTurns: number | null
  costUsd: number | null
  usage: unknown
  permissionDenials: unknown[]
  isError: boolean
  /** Why it did not end normally; null when it did. */
  errorKind: 'auth' | 'rate_limit' | 'max_turns' | 'stopped' | 'crash' | null
  error: string | null
}

const SUMMARY_MAX = 300
const DATA_MAX = 8 * 1024

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

/** A value as JSON, cut to 8 KB (then kept as a string, so it is still valid JSON). */
const capped = (value: unknown) => {
  const json = JSON.stringify(value)
  return json.length <= DATA_MAX ? value : { truncated: true, json: json.slice(0, DATA_MAX) }
}

type Block = {
  type?: string
  text?: string
  name?: string
  input?: unknown
  content?: unknown
  is_error?: boolean
}

const blocks = (content: unknown): Block[] => (Array.isArray(content) ? (content as Block[]) : [])

const inputSummary = (name: string, input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>
  const pick = i['command'] ?? i['file_path'] ?? i['pattern'] ?? i['url'] ?? i['query']
  return clip(`${name} ${typeof pick === 'string' ? pick : JSON.stringify(input)}`, SUMMARY_MAX)
}

const resultText = (content: unknown) =>
  typeof content === 'string'
    ? content
    : blocks(content)
        .map((b) => b.text ?? '')
        .join(' ')

/** The events a stream-json line becomes (an assistant message may hold text and tool calls). */
export const eventsOf = (line: StreamLine): RunEvent[] => {
  switch (line.type) {
    case 'system':
      return [
        {
          type: 'system',
          summary: clip(line.subtype ?? 'system', SUMMARY_MAX),
          data: capped(line),
        },
      ]
    case 'assistant':
      return blocks(line.message?.content).flatMap<RunEvent>((b) => {
        if (b.type === 'text' && b.text?.trim())
          return [{ type: 'assistant', summary: clip(b.text.trim(), SUMMARY_MAX), data: capped(b) }]
        if (b.type === 'tool_use')
          return [
            { type: 'tool_use', summary: inputSummary(b.name ?? 'tool', b.input), data: capped(b) },
          ]
        return []
      })
    case 'user':
      return blocks(line.message?.content)
        .filter((b) => b.type === 'tool_result')
        .map((b) => ({
          type: 'tool_result' as const,
          summary: clip(
            `${b.is_error ? 'error: ' : ''}${resultText(b.content).trim() || '(empty)'}`,
            SUMMARY_MAX,
          ),
          data: capped(b),
        }))
    case 'result':
      return [
        {
          type: 'result',
          summary: clip(line.result ?? line.subtype ?? 'result', SUMMARY_MAX),
          data: capped(line),
        },
      ]
    case undefined:
    default:
      return []
  }
}

/**
 * Why a run failed, from what the stream said (spike S5: a bad token gives `is_error`,
 * `api_error_status: 401` and an assistant line with `error: "authentication_failed"`).
 */
export const classify = (
  lines: { result: StreamLine | null; errors: string[] },
  exitCode: number,
  stopped: boolean,
): ClaudeResult['errorKind'] => {
  if (stopped) return 'stopped'
  const r = lines.result
  const status = r?.api_error_status ?? null
  const text = `${r?.result ?? ''} ${lines.errors.join(' ')}`.toLowerCase()
  if (
    status === 401 ||
    status === 403 ||
    lines.errors.includes('authentication_failed') ||
    /failed to authenticate|invalid api key|oauth.*(invalid|expired)/.test(text)
  )
    return 'auth'
  if (
    status === 429 ||
    lines.errors.includes('rate_limit') ||
    /rate.?limit|usage limit|limit reached|quota/.test(text)
  )
    return 'rate_limit'
  if (r?.subtype === 'error_max_turns' || r?.terminal_reason === 'max_turns') return 'max_turns'
  if (r?.is_error || exitCode !== 0 || !r) return 'crash'
  return null
}

export type ClaudeSpawn = {
  /** The `claude` executable (a path, or a name found on `PATH`). */
  bin: string
  args: string[]
  cwd: string
  env: Record<string, string>
  prompt: string
  /** Each raw line, already redacted, for the log file. */
  onLine: (line: string) => void | Promise<void>
  onEvent: (event: RunEvent) => void | Promise<void>
  /** Strings never to write anywhere (tokens). */
  secrets: readonly string[]
  timeoutMs: number
}

export type ClaudeHandle = { result: Promise<ClaudeResult>; stop: () => void; pid: number }

export const redact = (text: string, secrets: readonly string[]) =>
  secrets.reduce(
    (acc, secret) => (secret.length >= 8 ? acc.split(secret).join('[redacted]') : acc),
    text,
  )

/** Spawns `claude -p` with the prompt on stdin and reads its stream-json, line by line. */
export const spawnClaude = (options: ClaudeSpawn): ClaudeHandle => {
  const proc = Bun.spawn([options.bin, ...options.args], {
    cwd: options.cwd,
    env: options.env,
    stdin: new TextEncoder().encode(options.prompt),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  let stopped = false
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (stopped) return
    stopped = true
    proc.kill('SIGTERM')
    killTimer = setTimeout(() => {
      proc.kill('SIGKILL')
    }, 10_000)
  }
  const timeout = setTimeout(stop, options.timeoutMs)

  const result = (async (): Promise<ClaudeResult> => {
    let last: StreamLine | null = null
    let sessionId: string | null = null
    const errors: string[] = []
    const decoder = new TextDecoder()
    let buffer = ''
    const handle = async (raw: string) => {
      const line = raw.trim()
      if (!line) return
      const clean = redact(line, options.secrets)
      await options.onLine(clean)
      let parsed: StreamLine
      try {
        parsed = JSON.parse(clean) as StreamLine
      } catch {
        return
      }
      if (parsed.session_id) sessionId = parsed.session_id
      if (parsed.type === 'assistant' && parsed.error) errors.push(parsed.error)
      if (parsed.type === 'result') last = parsed
      for (const event of eventsOf(parsed)) await options.onEvent(event)
    }
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) await handle(line)
    }
    await handle(buffer)
    const stderr = redact(await new Response(proc.stderr).text(), options.secrets)
    const exitCode = await proc.exited
    clearTimeout(timeout)
    if (killTimer) clearTimeout(killTimer)
    const r = last as StreamLine | null
    const errorKind = classify({ result: r, errors }, exitCode, stopped)
    return {
      exitCode,
      sessionId,
      summary: r?.result ?? null,
      numTurns: r?.num_turns ?? null,
      costUsd: r?.total_cost_usd ?? null,
      usage: r?.usage ?? null,
      permissionDenials: r?.permission_denials ?? [],
      isError: errorKind !== null,
      errorKind,
      error:
        errorKind === null
          ? null
          : clip(r?.result ?? (stderr.trim() || `claude exited with ${String(exitCode)}`), 2000),
    }
  })()

  return { result, stop, pid: proc.pid }
}

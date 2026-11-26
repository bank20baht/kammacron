import { createRedactor } from './redact'

type ShellResult = {
  exitCode: number
  /** The last `TAIL` characters of stdout and stderr, as they came. */
  output: string
  stopped: boolean
  timedOut: boolean
}

export type ShellHandle = { result: Promise<ShellResult>; stop: () => void }

const TAIL = 8000

/**
 * `sh -c <command>` in its own process group, so Stop and the timeout reach whatever it started
 * (ssh, a test runner). Output goes to `onChunk` (redacted) and its end is kept for the step row.
 */
export const spawnShell = (options: {
  command: string
  cwd: string
  env: Record<string, string>
  timeoutMs: number
  secrets: readonly string[]
  onChunk: (text: string) => void | Promise<void>
}): ShellHandle => {
  const proc = Bun.spawn(['sh', '-c', options.command], {
    cwd: options.cwd,
    env: options.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  })
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-proc.pid, name)
    } catch {
      proc.kill(name)
    }
  }
  let stopped = false
  let timedOut = false
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const end = () => {
    signal('SIGTERM')
    killTimer = setTimeout(() => {
      signal('SIGKILL')
    }, 10_000)
  }
  const timeout = setTimeout(() => {
    timedOut = true
    end()
  }, options.timeoutMs)

  let tail = ''
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder()
    const redactor = createRedactor(options.secrets)
    const keep = async (text: string) => {
      if (!text) return
      tail = (tail + text).slice(-TAIL)
      await options.onChunk(text)
    }
    for await (const chunk of stream)
      await keep(redactor.push(decoder.decode(chunk, { stream: true })))
    await keep(redactor.end())
  }
  const result = (async (): Promise<ShellResult> => {
    await Promise.all([read(proc.stdout), read(proc.stderr)])
    const exitCode = await proc.exited
    clearTimeout(timeout)
    if (killTimer) clearTimeout(killTimer)
    return { exitCode, output: tail, stopped, timedOut }
  })()
  return {
    result,
    stop: () => {
      if (stopped) return
      stopped = true
      end()
    },
  }
}

import { join } from 'node:path'

export type Exec = { code: number; stdout: string; stderr: string }

/** Runs a command; never throws for a non-zero exit (the caller reads `code`). */
export const exec = async (
  cmd: readonly string[],
  options: {
    cwd: string
    env?: Record<string, string | undefined>
    timeoutMs?: number
    input?: string
  },
): Promise<Exec> => {
  const proc = Bun.spawn([...cmd], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: options.input === undefined ? 'ignore' : new TextEncoder().encode(options.input),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const timer =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          proc.kill('SIGKILL')
        }, options.timeoutMs)
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (timer) clearTimeout(timer)
  return { code, stdout, stderr }
}

export type Git = ReturnType<typeof gitIn>

/** git in one directory, with the worker's PATH (hooks need it too). */
export const gitIn = (cwd: string, env: Record<string, string | undefined> = {}) => {
  const run = (...args: string[]) =>
    exec(['git', ...args], { cwd, env: { GIT_TERMINAL_PROMPT: '0', ...env } })
  const out = async (...args: string[]) => {
    const r = await run(...args)
    if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`)
    return r.stdout.trim()
  }
  return { cwd, run, out }
}

export type DirCheck = {
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
}

/** What Settings shows for a project's directory: is it there, and what kammacron finds in it. */
export const checkDir = async (
  path: string,
  env: Record<string, string | undefined> = {},
): Promise<DirCheck> => {
  const checks: DirCheck['checks'] = []
  const isDir = (await exec(['test', '-d', path], { cwd: '/' })).code === 0
  checks.push({
    name: 'directory',
    ok: isDir,
    detail: isDir ? path : 'no directory at this path',
  })
  if (!isDir) return { ok: false, checks }
  const local = await localGit(gitIn(path, env))
  checks.push({
    name: 'git',
    ok: true,
    detail: local.branch
      ? `on ${local.branch}${local.dirty ? ', with uncommitted changes' : ''}`
      : 'not a git repository, or a detached HEAD (fine: the playbook decides)',
  })
  const rules = ['CLAUDE.md', '.claude-worker/prompt.md']
  const found: string[] = []
  for (const name of rules) if (await Bun.file(join(path, name)).exists()) found.push(name)
  checks.push({
    name: 'project instructions',
    ok: true,
    detail: found.length > 0 ? found.join(', ') : 'none (CLAUDE.md or .claude-worker/prompt.md)',
  })
  return { ok: true, checks }
}

/** The project's directory as git sees it now, from local refs only (no fetch): for the board. */
export type LocalGit = {
  /** The checked-out branch; null on a detached HEAD or outside a repo. */
  branch: string | null
  /** Uncommitted changes, untracked files included (ignored ones not). */
  dirty: boolean
  /** Commits on the branch that origin's copy lacks, and the other way; null without one. */
  ahead: number | null
  behind: number | null
}

export const localGit = async (repo: Git): Promise<LocalGit> => {
  const head = await repo.run('branch', '--show-current')
  if (head.code !== 0) return { branch: null, dirty: false, ahead: null, behind: null }
  const branch = head.stdout.trim() || null
  const status = await repo.run('status', '--porcelain')
  const dirty = status.code === 0 && status.stdout.trim() !== ''
  if (!branch) return { branch, dirty, ahead: null, behind: null }
  const counts = await repo.run('rev-list', '--left-right', '--count', `HEAD...origin/${branch}`)
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number)
  return counts.code === 0 && ahead !== undefined && behind !== undefined
    ? { branch, dirty, ahead, behind }
    : { branch, dirty, ahead: null, behind: null }
}

import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

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

export type RepoCheck = {
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
  default_branch: string | null
}

/** What Settings shows when a repo is linked: is it a repo, with an origin, a default branch, hooks. */
export const checkRepo = async (
  path: string,
  env: Record<string, string | undefined> = {},
): Promise<RepoCheck> => {
  const checks: RepoCheck['checks'] = []
  const git = gitIn(path, env)
  const top = await git.run('rev-parse', '--show-toplevel')
  checks.push({
    name: 'git repository',
    ok: top.code === 0,
    detail: top.code === 0 ? top.stdout.trim() : top.stderr.trim(),
  })
  if (top.code !== 0) return { ok: false, checks, default_branch: null }
  const origin = await git.run('remote', 'get-url', 'origin')
  checks.push({
    name: 'origin remote',
    ok: origin.code === 0,
    detail: origin.code === 0 ? origin.stdout.trim() : 'no remote named origin',
  })
  const branch = origin.code === 0 ? await defaultBranch(git) : null
  checks.push({
    name: 'default branch',
    ok: branch !== null,
    detail: branch ?? 'origin/HEAD is not set; run git remote set-head origin --auto',
  })
  const hook = await prePushHook(git)
  checks.push({
    name: 'pre-push hook',
    ok: hook !== null,
    detail:
      hook ?? 'no pre-push hook: everything Claude pushes reaches the default branch unchecked',
  })
  return { ok: checks.slice(0, 3).every((c) => c.ok), checks, default_branch: branch }
}

/** `origin/HEAD`'s branch, asking the remote when the local ref is not set. */
export const defaultBranch = async (git: Git): Promise<string | null> => {
  const local = await git.run('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
  if (local.code === 0) return local.stdout.trim().replace(/^origin\//, '')
  const remote = await git.run('ls-remote', '--symref', 'origin', 'HEAD')
  const match = /^ref: refs\/heads\/(\S+)\s+HEAD/m.exec(remote.stdout)
  return match?.[1] ?? null
}

/** The pre-push hook git would run, honouring `core.hooksPath` (husky); null when none. */
export const prePushHook = async (git: Git): Promise<string | null> => {
  const configured = (await git.run('config', '--get', 'core.hooksPath')).stdout.trim()
  const dir = configured
    ? isAbsolute(configured)
      ? configured
      : resolve(git.cwd, configured)
    : join(await git.out('rev-parse', '--git-common-dir').then((d) => resolve(git.cwd, d)), 'hooks')
  const hook = join(dir, 'pre-push')
  return (await Bun.file(hook).exists()) ? hook : null
}

/** Remote heads as `{ ref: sha }`, read from the remote itself (not the local copy). */
export const remoteHeads = async (git: Git): Promise<Record<string, string>> => {
  const r = await git.run('ls-remote', '--heads', 'origin')
  if (r.code !== 0) throw new Error(`git ls-remote: ${r.stderr.trim()}`)
  const heads: Record<string, string> = {}
  for (const line of r.stdout.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/)
    if (sha && ref) heads[ref.replace(/^refs\/heads\//, '')] = sha
  }
  return heads
}

/** Adds lines to `.git/info/exclude` (shared by every worktree), once each. */
export const exclude = async (git: Git, patterns: readonly string[]) => {
  const common = resolve(git.cwd, await git.out('rev-parse', '--git-common-dir'))
  const file = join(common, 'info', 'exclude')
  await mkdir(dirname(file), { recursive: true })
  const current = await readFile(file, 'utf8').catch(() => '')
  const lines = new Set(current.split('\n').map((l) => l.trim()))
  const missing = patterns.filter((p) => !lines.has(p))
  if (missing.length > 0)
    await appendFile(
      file,
      `${current.endsWith('\n') || !current ? '' : '\n'}${missing.join('\n')}\n`,
    )
}

/** A hash of the lock files present, to know when dependencies changed. */
export const hashFiles = async (dir: string, files: readonly string[]) => {
  const hash = createHash('sha256')
  for (const name of files) {
    const file = Bun.file(join(dir, name))
    if (await file.exists()) hash.update(name).update(new Uint8Array(await file.arrayBuffer()))
  }
  return hash.digest('hex')
}

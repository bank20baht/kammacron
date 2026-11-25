import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Project } from '../services/projects'
import type { WorkerEnv } from './env'
import { defaultBranch, exec, gitIn, type Git } from './git'

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

/** The branch runs start from and ship to: the directory's own, or the default with a worktree. */
export const targetBranch = async (project: Project, repo: Git): Promise<string | null> =>
  project.use_worktree
    ? (project.default_branch ?? (await defaultBranch(repo)))
    : (await localGit(repo)).branch

/**
 * Where a run (or an approve) works. With `use_worktree`, the project's worktree; without, the
 * directory itself, on its branch, only when it is clean and has nothing unpushed. `release` puts
 * the directory back on that branch afterwards (anything left uncommitted goes to a stash), moved
 * up to what origin has now; it never throws, and says what went wrong instead.
 */
export type Workspace = {
  git: Git
  dir: string
  branch: string
  release: (label: string) => Promise<string | null>
}

export const openWorkspace = async (
  env: WorkerEnv,
  project: Project & { repo_path: string },
  childEnvironment: Record<string, string>,
): Promise<Workspace | { skip: string }> => {
  const repo = gitIn(project.repo_path, childEnvironment)
  if (project.use_worktree) {
    const branch = project.default_branch ?? (await defaultBranch(repo))
    if (!branch) return { skip: 'cannot find the default branch (origin/HEAD)' }
    const dir = worktreeDir(env, project)
    const git = gitIn((await ensureWorktree(repo, dir, branch)).cwd, childEnvironment)
    return { git, dir, branch, release: () => Promise.resolve(null) }
  }
  const local = await localGit(repo)
  if (!local.branch) return { skip: 'the directory is not on a branch (detached HEAD)' }
  if (local.dirty) return { skip: `the directory has uncommitted changes on ${local.branch}` }
  await repo.out('fetch', 'origin', '--prune')
  const { branch } = local
  if ((await repo.run('rev-parse', '--verify', '--quiet', `origin/${branch}`)).code !== 0)
    return { skip: `${branch} is not on origin; push it once first` }
  const unpushed = Number((await repo.out('rev-list', '--count', `origin/${branch}..HEAD`)) || '0')
  if (unpushed > 0)
    return {
      skip: `${branch} has ${String(unpushed)} commit${unpushed === 1 ? '' : 's'} not on origin; push or drop them first`,
    }
  return {
    git: repo,
    dir: project.repo_path,
    branch,
    release: (label) => restore(repo, branch, label),
  }
}

/** The directory back on its branch, leftovers stashed, fast-forwarded to origin. */
const restore = async (repo: Git, branch: string, label: string): Promise<string | null> => {
  const problems: string[] = []
  for (const stop of [
    ['rebase', '--abort'],
    ['merge', '--abort'],
    ['cherry-pick', '--abort'],
    ['revert', '--abort'],
  ])
    await repo.run(...stop)
  const status = await repo.run('status', '--porcelain')
  if (status.stdout.trim()) {
    const stash = await repo.run(
      'stash',
      'push',
      '--include-untracked',
      '-m',
      `kammacron: left by ${label}`,
    )
    if (stash.code !== 0)
      problems.push(`could not stash what ${label} left: ${stash.stderr.trim()}`)
    else
      problems.push(
        `${label} left uncommitted changes; they are in git stash ("kammacron: left by ${label}")`,
      )
  }
  const checkout = await repo.run('checkout', '-q', branch)
  if (checkout.code !== 0) {
    problems.push(`could not switch the directory back to ${branch}: ${checkout.stderr.trim()}`)
    return problems.join('; ')
  }
  await repo.run('merge', '-q', '--ff-only', `origin/${branch}`)
  return problems.length > 0 ? problems.join('; ') : null
}

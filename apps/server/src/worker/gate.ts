import type { Project } from '../services/projects'
import { conflict } from '../services/errors'
import { exec, type Git } from './git'

const COMMITTER = { GIT_COMMITTER_NAME: 'kammacron', GIT_COMMITTER_EMAIL: 'kammacron@localhost' }

/**
 * `claude/<card>` rebased onto the default branch and pushed there: an ordinary push, so the repo's
 * pre-push runs. Returns the pushed sha; a conflict or a refused push throws (409), touching nothing.
 */
export const shipBranch = async (
  wt: Git,
  env: Record<string, string>,
  branch: string,
  branchName: string,
) => {
  await wt.out('checkout', '-f', '-B', branch, `origin/${branch}`)
  const rebase = await exec(['git', 'rebase', `origin/${branchName}`], {
    cwd: wt.cwd,
    env: { ...env, ...COMMITTER },
  })
  if (rebase.code !== 0) {
    await wt.run('rebase', '--abort')
    throw conflict(
      'REBASE_CONFLICT',
      `${branch} does not rebase cleanly onto ${branchName}: ${(rebase.stdout + rebase.stderr).trim().slice(-800)}`,
    )
  }
  const push = await exec(['git', 'push', 'origin', `HEAD:${branchName}`], {
    cwd: wt.cwd,
    env: env,
  })
  if (push.code !== 0)
    throw conflict(
      'PUSH_REFUSED',
      `push to ${branchName} refused: ${(push.stderr || push.stdout).trim().slice(-1500)}`,
    )
  return wt.out('rev-parse', 'HEAD')
}

/** Does this project gate the default branch (Claude ships to claude/<card>, kammacron pushes on)? */
export const isGated = (project: Project) =>
  project.ship_policy === 'push' &&
  (project.max_diff_lines !== null || project.protected_paths.length > 0)

export type GateVerdict = { ok: boolean; reason: string | null; lines: number; files: string[] }

/** The run's diff against its base: at most `max_diff_lines`, and no file under a protected glob. */
export const checkGate = async (
  git: Git,
  project: Project,
  base: string,
  head: string,
): Promise<GateVerdict> => {
  const numstat = await git.out('diff', '--numstat', `${base}..${head}`)
  const rows = numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, removed, path] = line.split('\t')
      return { path: path ?? '', lines: (Number(added) || 0) + (Number(removed) || 0) }
    })
  const lines = rows.reduce((sum, r) => sum + r.lines, 0)
  const files = rows.map((r) => r.path)
  const globs = project.protected_paths.map((pattern) => new Bun.Glob(pattern))
  const touched = files.filter((file) => globs.some((glob) => glob.match(file)))
  if (touched.length > 0)
    return {
      ok: false,
      reason: `touches protected paths: ${touched.slice(0, 10).join(', ')}`,
      lines,
      files,
    }
  if (project.max_diff_lines !== null && lines > project.max_diff_lines)
    return {
      ok: false,
      reason: `the diff is ${String(lines)} lines, over the limit of ${String(project.max_diff_lines)}`,
      lines,
      files,
    }
  return { ok: true, reason: null, lines, files }
}

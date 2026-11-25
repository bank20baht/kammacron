import { eq } from 'drizzle-orm'

import { projects } from '../db/schema'
import { addAlert } from '../services/alerts'
import { addComment, moveCard } from '../services/cards'
import type { Project } from '../services/projects'
import { updateRun, type Run } from '../services/runs'
import { exec, type Git } from './git'
import { cardBranch, childEnv, type WorkerEnv } from './env'

const TAIL = 3000
const tail = (text: string) => (text.length > TAIL ? `…${text.slice(-TAIL)}` : text)

const AUTHOR = {
  GIT_AUTHOR_NAME: 'kammacron',
  GIT_AUTHOR_EMAIL: 'kammacron@localhost',
  GIT_COMMITTER_NAME: 'kammacron',
  GIT_COMMITTER_EMAIL: 'kammacron@localhost',
}

/** `verify_command` at a commit, in the worktree; output joined, cut to its end. */
const verifyAt = async (env: WorkerEnv, project: Project, git: Git, sha: string) => {
  await git.out('checkout', '-f', '--detach', sha)
  const r = await exec(['sh', '-c', project.verify_command ?? 'true'], {
    cwd: git.cwd,
    env: await childEnv(env),
    timeoutMs: project.verify_timeout_minutes * 60_000,
  })
  return { ok: r.code === 0, output: tail(`${r.stdout}\n${r.stderr}`.trim()) }
}

const pauseProject = async (
  env: WorkerEnv,
  project: Project,
  run: Run,
  cardId: number,
  reason: string,
) => {
  await env.db.update(projects).set({ paused_reason: reason }).where(eq(projects.id, project.id))
  await addAlert(env.db, {
    level: 'error',
    project_id: project.id,
    card_id: cardId,
    run_id: run.id,
    message: `${project.name} paused: ${reason}`,
  })
  await env.notify('kammacron paused a project', `${project.name}: ${reason}`)
}

/**
 * After a run pushed to the default branch: run the project's heavier check on what it pushed
 * (twice, for flaky tests). Failing, revert the run's commits with an ordinary push, and send the
 * card to review; its work stays on `claude/<card>`. Never tries to fix anything itself: when the
 * branch was already broken, or the revert cannot be pushed, the project is paused for a person.
 */
export const verifyAndRevert = async (
  env: WorkerEnv,
  input: {
    project: Project
    run: Run
    cardId: number
    git: Git
    defaultBranch: string
    baseSha: string
    headSha: string
    commits: string[]
  },
): Promise<Run> => {
  const { project, cardId, git, defaultBranch, baseSha, headSha, commits } = input
  let run = await updateRun(env.db, input.run.id, { status: 'verifying' })
  let check = await verifyAt(env, project, git, headSha)
  if (!check.ok) check = await verifyAt(env, project, git, headSha)
  if (check.ok)
    return updateRun(env.db, run.id, { status: 'succeeded', verify_output: check.output })
  run = await updateRun(env.db, run.id, { verify_output: check.output })

  // was it broken before this run? then reverting would not fix it
  const base = await verifyAt(env, project, git, baseSha)
  if (!base.ok) {
    run = await updateRun(env.db, run.id, {
      status: 'failed',
      error: `verify fails on ${baseSha.slice(0, 8)} too: ${defaultBranch} was broken before this run`,
    })
    await moveCard(env.db, cardId, {
      status: 'review',
      reason: `verify failed after push, and it fails before this run too; nothing reverted`,
    })
    await pauseProject(
      env,
      project,
      run,
      cardId,
      `${defaultBranch} fails verify_command at ${baseSha.slice(0, 8)}, before run ${String(run.id)}`,
    )
    return run
  }

  // keep the work where Claude can continue it, then take it off the default branch
  const branch = cardBranch(cardId)
  await git.run('push', 'origin', `${headSha}:refs/heads/${branch}`)
  await git.out('fetch', 'origin', '--prune')
  await git.out('checkout', '-f', '--detach', `origin/${defaultBranch}`)
  const revert = await git.run('revert', '--no-commit', ...[...commits].reverse())
  const message = `revert: card #${String(cardId)}, run ${String(run.id)} failed verify\n\nverify_command: ${project.verify_command ?? ''}\nReverts ${commits.map((c) => c.slice(0, 8)).join(', ')}. The work is on ${branch}.`
  const commit =
    revert.code === 0
      ? await exec(['git', 'commit', '-m', message], {
          cwd: git.cwd,
          env: { ...(await childEnv(env)), ...AUTHOR },
        })
      : revert
  const push =
    commit.code === 0
      ? await exec(['git', 'push', 'origin', `HEAD:${defaultBranch}`], {
          cwd: git.cwd,
          env: await childEnv(env),
        })
      : commit
  if (push.code !== 0) {
    await git.run('revert', '--abort')
    run = await updateRun(env.db, run.id, {
      status: 'failed',
      error: `could not revert: ${(push.stderr || push.stdout).trim().slice(-800)}`,
    })
    await moveCard(env.db, cardId, {
      status: 'review',
      reason: `verify failed after push and the revert could not be pushed; ${defaultBranch} still has the commits`,
    })
    await pauseProject(
      env,
      project,
      run,
      cardId,
      `the revert of run ${String(run.id)} could not be pushed (new commits on ${defaultBranch}?)`,
    )
    return run
  }
  const revertSha = await git.out('rev-parse', 'HEAD')
  run = await updateRun(env.db, run.id, { status: 'reverted', revert_commit: revertSha })
  await addComment(env.db, cardId, {
    author: 'claude-worker',
    run_id: run.id,
    body: `verify_command failed on ${headSha.slice(0, 8)} (twice), so kammacron reverted it in ${revertSha.slice(0, 8)}. The work is on \`${branch}\`.\n\n\`\`\`\n${check.output}\n\`\`\``,
  })
  await moveCard(env.db, cardId, {
    status: 'review',
    reason: `verify failed after push; reverted in ${revertSha.slice(0, 8)}, work kept on ${branch}`,
  })
  await addAlert(env.db, {
    level: 'warning',
    project_id: project.id,
    card_id: cardId,
    run_id: run.id,
    message: `${project.name}: run ${String(run.id)} failed verify and was reverted`,
  })
  await env.notify(`#${String(cardId)} reverted`, `${project.name}: verify failed after push`)
  return run
}

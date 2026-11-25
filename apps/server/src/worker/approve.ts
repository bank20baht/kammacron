import { and, eq, inArray } from 'drizzle-orm'

import { cards, runs } from '../db/schema'
import { addComment, moveCard } from '../services/cards'
import { conflict, invalid } from '../services/errors'
import { getProject } from '../services/projects'
import { cardBranch, childEnv, type WorkerEnv } from './env'
import { defaultBranch, exec, gitIn, remoteHeads } from './git'
import { ensureWorktree, worktreeDir } from './runner'

const COMMITTER = { GIT_COMMITTER_NAME: 'kammacron', GIT_COMMITTER_EMAIL: 'kammacron@localhost' }

/**
 * Approve: rebase `claude/<card>` onto the default branch and push it there (an ordinary push, so
 * pre-push runs). A conflict or a refused push leaves the card in review with the error.
 * A card in review with no branch (a question, a decision) is simply done.
 */
export const approveCard = async (env: WorkerEnv, cardId: number) => {
  const [card] = await env.db.select().from(cards).where(eq(cards.id, cardId))
  if (!card) throw invalid('NOT_FOUND', `card #${String(cardId)} not found`)
  if (card.status !== 'review')
    throw invalid('NOT_IN_REVIEW', `card #${String(cardId)} is ${card.status}, not review`)
  const project = await getProject(env.db, card.project_id)
  if (!card.branch || !project.repo_path) return moveCard(env.db, cardId, { status: 'done' })

  const childEnvironment = await childEnv(env)
  const repo = gitIn(project.repo_path, childEnvironment)
  const branchName = project.default_branch ?? (await defaultBranch(repo))
  if (!branchName)
    throw conflict('NO_DEFAULT_BRANCH', 'cannot find the default branch (origin/HEAD)')
  // the worktree is the worker's while a run of this project goes
  const live = [...env.handles.keys()]
  if (live.length > 0) {
    const busy = await env.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(inArray(runs.id, live), eq(runs.project_id, project.id)))
    if (busy.length > 0)
      throw conflict('WORKTREE_BUSY', 'a run of this project is going; approve when it ends')
  }
  const wt = gitIn(
    (await ensureWorktree(repo, worktreeDir(env, project), branchName)).cwd,
    childEnvironment,
  )
  const branch = cardBranch(cardId)
  await wt.out('fetch', 'origin', '--prune')
  const heads = await remoteHeads(wt)
  if (!heads[branch]) {
    await env.db.update(cards).set({ branch: null }).where(eq(cards.id, cardId))
    return moveCard(env.db, cardId, { status: 'done' })
  }
  await wt.out('checkout', '-f', '-B', branch, `origin/${branch}`)
  const rebase = await exec(['git', 'rebase', `origin/${branchName}`], {
    cwd: wt.cwd,
    env: { ...childEnvironment, ...COMMITTER },
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
    env: childEnvironment,
  })
  if (push.code !== 0)
    throw conflict(
      'PUSH_REFUSED',
      `push to ${branchName} refused: ${(push.stderr || push.stdout).trim().slice(-1500)}`,
    )
  const sha = await wt.out('rev-parse', 'HEAD')
  await addComment(env.db, cardId, {
    author: 'user',
    body: `Approved: ${branch} rebased and pushed to ${branchName} at ${sha.slice(0, 8)}.`,
  })
  return moveCard(env.db, cardId, { status: 'done' })
}

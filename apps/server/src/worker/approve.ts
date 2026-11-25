import { and, eq, inArray } from 'drizzle-orm'

import { cards, runs } from '../db/schema'
import { addComment, moveCard } from '../services/cards'
import { conflict, invalid } from '../services/errors'
import { getProject } from '../services/projects'
import { cardBranch, childEnv, type WorkerEnv } from './env'
import { shipBranch } from './gate'
import { remoteHeads } from './git'
import { openWorkspace } from './workspace'

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
  // the working copy is the worker's while a run of this project goes
  const live = [...env.handles.keys()]
  if (live.length > 0) {
    const busy = await env.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(inArray(runs.id, live), eq(runs.project_id, project.id)))
    if (busy.length > 0)
      throw conflict('WORKTREE_BUSY', 'a run of this project is going; approve when it ends')
  }
  const space = await openWorkspace(
    env,
    { ...project, repo_path: project.repo_path },
    childEnvironment,
  )
  if ('skip' in space) throw conflict('WORKSPACE_BUSY', `cannot approve now: ${space.skip}`)
  const { git: wt, branch: branchName } = space
  try {
    const branch = cardBranch(cardId)
    await wt.out('fetch', 'origin', '--prune')
    const heads = await remoteHeads(wt)
    if (!heads[branch]) {
      await env.db.update(cards).set({ branch: null }).where(eq(cards.id, cardId))
      return await moveCard(env.db, cardId, { status: 'done' })
    }
    const sha = await shipBranch(wt, childEnvironment, branch, branchName)
    await addComment(env.db, cardId, {
      author: 'user',
      body: `Approved: ${branch} rebased and pushed to ${branchName} at ${sha.slice(0, 8)}.`,
    })
    return await moveCard(env.db, cardId, { status: 'done' })
  } finally {
    await space.release(`the approval of #${String(cardId)}`)
  }
}

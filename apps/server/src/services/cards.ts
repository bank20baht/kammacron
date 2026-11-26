import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  max,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import {
  attachments,
  cardWaitsOn,
  cards,
  comments,
  AUTOPILOT_TAG,
  PLAYBOOK_TAG,
  projects,
  runs,
  type CardStatus,
  type CommentAuthor,
} from '../db/schema'
import { linkAttachments } from './attachments'
import { invalid, notFound } from './errors'

export type Card = typeof cards.$inferSelect

export type CardQuery = {
  project_id?: number | undefined
  status?: CardStatus | undefined
  tag?: string | undefined
  /** Text looked for in the title and the body. */
  q?: string | undefined
  archived?: boolean | undefined
}

export const listCards = (db: Executor, query: CardQuery = {}) => {
  const where: SQL[] = [eq(cards.archived, query.archived ?? false)]
  if (query.project_id !== undefined) where.push(eq(cards.project_id, query.project_id))
  if (query.status !== undefined) where.push(eq(cards.status, query.status))
  if (query.tag !== undefined) where.push(arrayContains(cards.tags, [query.tag]))
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const text = or(ilike(cards.title, like), ilike(cards.body, like))
    if (text) where.push(text)
  }
  return db
    .select()
    .from(cards)
    .where(and(...where))
    .orderBy(asc(cards.status), asc(cards.position), asc(cards.id))
}

const cardRow = async (db: Executor, id: number): Promise<Card> => {
  const [row] = await db.select().from(cards).where(eq(cards.id, id))
  if (!row) throw notFound('card', id)
  return row
}

/** A card with what a reader needs beside it: comments, what it waits on, its last run, files. */
export const getCard = async (db: Executor, id: number) => {
  const card = await cardRow(db, id)
  const [cardComments, waitsOn, lastRun, files] = await Promise.all([
    db.select().from(comments).where(eq(comments.card_id, id)).orderBy(asc(comments.id)),
    db
      .select({ id: cards.id, title: cards.title, status: cards.status })
      .from(cardWaitsOn)
      .innerJoin(cards, eq(cards.id, cardWaitsOn.waits_on_id))
      .where(eq(cardWaitsOn.card_id, id))
      .orderBy(asc(cards.id)),
    db.select().from(runs).where(eq(runs.card_id, id)).orderBy(desc(runs.id)).limit(1),
    db
      .select({
        id: attachments.id,
        filename: attachments.filename,
        mime: attachments.mime,
        size: attachments.size,
      })
      .from(attachments)
      .where(eq(attachments.card_id, id))
      .orderBy(asc(attachments.created_at)),
  ])
  return {
    ...card,
    comments: cardComments,
    waits_on: waitsOn,
    last_run: lastRun[0] ?? null,
    attachments: files,
  }
}

/** Would `cardId` waiting on `targets` close a loop? Walks what the targets already wait on. */
const closesCycle = async (db: Executor, cardId: number, targets: readonly number[]) => {
  const seen = new Set<number>()
  let frontier = [...targets]
  while (frontier.length > 0) {
    if (frontier.includes(cardId)) return true
    for (const id of frontier) seen.add(id)
    const next = await db
      .select({ id: cardWaitsOn.waits_on_id })
      .from(cardWaitsOn)
      .where(inArray(cardWaitsOn.card_id, frontier))
    frontier = [...new Set(next.map((r) => r.id))].filter((id) => !seen.has(id))
  }
  return false
}

const setWaitsOn = async (db: Executor, cardId: number, waitsOn: readonly number[]) => {
  const targets = [...new Set(waitsOn)]
  if (targets.includes(cardId))
    throw invalid('WAITS_ON_SELF', `card #${String(cardId)} cannot wait on itself`)
  if (targets.length > 0) {
    const found = await db.select({ id: cards.id }).from(cards).where(inArray(cards.id, targets))
    const missing = targets.filter((id) => !found.some((f) => f.id === id))
    if (missing.length > 0)
      throw invalid('WAITS_ON_UNKNOWN', `no card ${missing.map((m) => `#${String(m)}`).join(', ')}`)
  }
  await db.delete(cardWaitsOn).where(eq(cardWaitsOn.card_id, cardId))
  if (targets.length === 0) return
  if (await closesCycle(db, cardId, targets))
    throw invalid(
      'WAITS_ON_CYCLE',
      `card #${String(cardId)} waiting on ${targets.join(', ')} closes a loop`,
    )
  await db
    .insert(cardWaitsOn)
    .values(targets.map((waits_on_id) => ({ card_id: cardId, waits_on_id })))
}

/** The next position at the end of a column. */
const endOf = async (db: Executor, projectId: number, status: CardStatus) => {
  const [row] = await db
    .select({ top: max(cards.position) })
    .from(cards)
    .where(and(eq(cards.project_id, projectId), eq(cards.status, status)))
  return (row?.top ?? 0) + 1
}

export type NewCard = {
  /** A name for this card inside the batch, so another card of it can wait on it. */
  ref?: string | undefined
  project_id: number
  title: string
  body?: string | undefined
  tags?: string[] | undefined
  human?: boolean | undefined
  priority?: number | undefined
  /** Card ids, or `ref`s of cards earlier or later in the same batch. */
  waits_on?: (number | string)[] | undefined
}

/** Creates the cards in one transaction; `waits_on` may name cards of the same batch by `ref`. */
export const createCards = (db: Executor, input: readonly NewCard[]) =>
  db.transaction(async (tx) => {
    const refs = new Map<string, number>()
    for (const c of input) {
      if (c.ref === undefined) continue
      if (refs.has(c.ref)) throw invalid('DUPLICATE_REF', `ref "${c.ref}" is used twice`)
      refs.set(c.ref, -1)
    }
    const created: Card[] = []
    for (const c of input) {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, c.project_id))
      if (!project) throw notFound('project', c.project_id)
      const row = firstRow(
        await tx
          .insert(cards)
          .values({
            project_id: c.project_id,
            title: c.title,
            body: c.body ?? '',
            tags: c.tags ?? [],
            human: c.human ?? false,
            priority: c.priority ?? 0,
            position: await endOf(tx, c.project_id, 'todo'),
          })
          .returning(),
      )
      created.push(row)
      await linkAttachments(tx, row.id, row.body)
      if (c.ref !== undefined) refs.set(c.ref, row.id)
    }
    for (const [i, c] of input.entries()) {
      const card = created[i]
      if (!card || !c.waits_on?.length) continue
      const ids = c.waits_on.map((w) => {
        if (typeof w === 'number') return w
        const id = refs.get(w)
        if (id === undefined) throw invalid('UNKNOWN_REF', `ref "${w}" is not in this batch`)
        return id
      })
      await setWaitsOn(tx, card.id, ids)
    }
    return created
  })

export type CardPatch = {
  title?: string | undefined
  body?: string | undefined
  tags?: string[] | undefined
  human?: boolean | undefined
  priority?: number | undefined
  waits_on?: number[] | undefined
}

export const updateCard = (db: Executor, id: number, patch: CardPatch) =>
  db.transaction(async (tx) => {
    await cardRow(tx, id)
    const { waits_on, ...fields } = patch
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
    if (Object.keys(set).length > 0) await tx.update(cards).set(set).where(eq(cards.id, id))
    if (waits_on !== undefined) await setWaitsOn(tx, id, waits_on)
    if (patch.body !== undefined) await linkAttachments(tx, id, patch.body)
    return cardRow(tx, id)
  })

export type Move = {
  status: CardStatus
  /** Required when moving to `review`: what the person deciding needs to know. */
  reason?: string | undefined
  /** Where in the column; the end when omitted. */
  position?: number | undefined
}

export const moveCard = (db: Executor, id: number, move: Move) =>
  db.transaction(async (tx) => {
    const card = await cardRow(tx, id)
    const reason = move.reason?.trim() ?? ''
    if (move.status === 'review' && !reason)
      throw invalid('REASON_REQUIRED', 'moving a card to review needs a reason')
    const position =
      move.position ??
      (card.status === move.status ? card.position : await endOf(tx, card.project_id, move.status))
    return firstRow(
      await tx
        .update(cards)
        .set({
          status: move.status,
          position,
          review_reason: move.status === 'review' ? reason : null,
          ...(move.status === 'doing' ? {} : { claimed_by_run: null }),
        })
        .where(eq(cards.id, id))
        .returning(),
    )
  })

export const archiveCard = async (db: Executor, id: number, archived = true) => {
  await cardRow(db, id)
  return firstRow(await db.update(cards).set({ archived }).where(eq(cards.id, id)).returning())
}

export const addComment = async (
  db: Executor,
  cardId: number,
  input: { author: CommentAuthor; body: string; run_id?: number | null | undefined },
) => {
  if (!input.body.trim()) throw invalid('EMPTY_COMMENT', 'a comment needs a body')
  await cardRow(db, cardId)
  await linkAttachments(db, cardId, input.body)
  return firstRow(
    await db
      .insert(comments)
      .values({
        card_id: cardId,
        author: input.author,
        body: input.body,
        run_id: input.run_id ?? null,
      })
      .returning(),
  )
}

/** "Send back": a review card returns to `todo` with the comment the worker will read next run. */
export const sendBack = (db: Executor, id: number, comment: string) =>
  db.transaction(async (tx) => {
    const card = await cardRow(tx, id)
    if (card.status !== 'review')
      throw invalid('NOT_IN_REVIEW', `card #${String(id)} is ${card.status}, not review`)
    await addComment(tx, id, { author: 'user', body: comment })
    return moveCard(tx, id, { status: 'todo' })
  })

/** Some card this one waits on is not done yet. */
const blocked = (db: Executor) =>
  db
    .select({ one: sql`1` })
    .from(cardWaitsOn)
    .innerJoin(sql`${cards} as w`, sql`w.id = ${cardWaitsOn.waits_on_id}`)
    .where(and(eq(cardWaitsOn.card_id, cards.id), sql`w.status <> 'done'`))

/** A card open to agents now: `todo`, not archived, not a person's, nothing it waits on open. */
const openToAgents = (db: Executor, projectId: number) =>
  and(
    eq(cards.project_id, projectId),
    eq(cards.status, 'todo'),
    eq(cards.archived, false),
    eq(cards.human, false),
    notExists(blocked(db)),
  )

const BEST_FIRST = [desc(cards.priority), asc(cards.created_at), asc(cards.id)]

/**
 * What the worker may take, best first: tagged `auto-pilot` (or naming a playbook), open to
 * agents, in a project with a directory and the worker on.
 */
export const pickableCards = (db: Executor, projectId: number, limit = 1) =>
  db
    .select({ card: cards })
    .from(cards)
    .innerJoin(projects, eq(projects.id, cards.project_id))
    .where(
      and(
        openToAgents(db, projectId),
        // tagged auto-pilot, or naming a playbook (which may have no agent step at all)
        or(
          arrayContains(cards.tags, [AUTOPILOT_TAG]),
          sql`exists (select 1 from unnest(${cards.tags}) as tag where tag like ${`${PLAYBOOK_TAG}%`})`,
        ),
        eq(projects.worker_enabled, true),
        sql`${projects.repo_path} is not null`,
      ),
    )
    .orderBy(...BEST_FIRST)
    .limit(limit)
    .then((rows) => rows.map((r) => r.card))

/** The `auto-pilot` cards an agent schedule may take, best first, whether the worker is on or not. */
export const autopilotCards = (db: Executor, projectId: number, limit = 20) =>
  db
    .select()
    .from(cards)
    .where(and(openToAgents(db, projectId), arrayContains(cards.tags, [AUTOPILOT_TAG])))
    .orderBy(...BEST_FIRST)
    .limit(limit)

/** Takes a `todo` card for a run: one statement, so of two claimers exactly one wins. */
export const claimCard = async (db: Executor, id: number, runId: number) => {
  const [row] = await db
    .update(cards)
    .set({ status: 'doing', claimed_by_run: runId })
    .where(and(eq(cards.id, id), eq(cards.status, 'todo')))
    .returning()
  return row ?? null
}

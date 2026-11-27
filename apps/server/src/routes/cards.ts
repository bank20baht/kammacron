import { idempotency } from '@20baht/elysia-idempotency'
import { pgStore } from '@20baht/elysia-idempotency/pg'
import { isToolCall } from '@20baht/elysia-openapi-mcp'
import { liveMacro, liveRoute } from '@20baht/live/elysia'
import { eq } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import { runScopeOf, type AuthState } from '../auth'
import type { AppContext } from '../context'
import { idParams, oneOf } from './params'
import {
  AUTOPILOT_TAG,
  CARD_STATUSES,
  cards,
  idempotencyKeys,
  type CommentAuthor,
} from '../db/schema'
import { invalid } from '../services/errors'
import {
  addComment,
  archiveCard,
  createCards,
  getCard,
  listCards,
  moveCard,
  sendBack,
  updateCard,
} from '../services/cards'

/** Rules for making cards, shared by the MCP server's instructions and the worker's prompt. */
export const CARD_RULES = `A card tagged "${AUTOPILOT_TAG}" is open to agents: the project's worker runs its playbook on it, and an agent schedule may take it.
Tag a card "${AUTOPILOT_TAG}" only when the work is reversible and has a clear done condition.
A card tagged "playbook:<name>" runs that playbook of its project instead of the default one (list_projects shows each project's playbooks).
Work that touches security, data or migrations, release or deploy, a breaking API, money, or a product decision is for a person: set human=true.
When a task is mostly a person's, split what an agent can do alone into small "${AUTOPILOT_TAG}" cards and make the big card wait on them (waits_on).`

/** How many cards a tool call gets from list_cards when it names no limit. */
const TOOL_CARDS = 100

const Status = oneOf(CARD_STATUSES, { description: 'todo, doing, review or done' })
const Id = idParams('Card number, as in #12')
const IdempotencyHeader = t.Object({
  'idempotency-key': t.Optional(
    t.String({
      description: 'Send the same key when retrying, so the cards are not created twice',
    }),
  ),
})

/** Who wrote this: a tool call of the worker's run, another MCP client, or the web app. */
const authorOf = (
  request: Request,
  auth: AuthState,
): { author: CommentAuthor; run_id: number | null } => {
  if (!isToolCall(request)) return { author: 'user', run_id: null }
  const run = runScopeOf(request, auth)
  return run ? { author: 'claude-worker', run_id: run.runId } : { author: 'mcp', run_id: null }
}

/**
 * A worker round's run writes to the card it holds, and to no other card that exists; an agent
 * schedule's run, to the cards of its own project.
 */
const onlyItsCard = async (ctx: AppContext, request: Request, id: number) => {
  const run = isToolCall(request) ? runScopeOf(request, ctx.auth) : undefined
  if (!run) return
  if ('cardId' in run) {
    if (run.cardId !== id)
      throw invalid(
        'NOT_YOUR_CARD',
        `this run works on card #${String(run.cardId)} only, not #${String(id)}`,
      )
    return
  }
  const card = await getCard(ctx.db, id)
  if (card.project_id !== run.projectId)
    throw invalid('NOT_YOUR_CARD', `card #${String(id)} is not in this run's project`)
}

/** An agent schedule's run that moves a card to doing holds it, as a worker round's run does. */
const holdIfAgent = async (ctx: AppContext, request: Request, id: number, status: string) => {
  const run = isToolCall(request) ? runScopeOf(request, ctx.auth) : undefined
  if (status === 'doing' && run && !('cardId' in run))
    await ctx.db.update(cards).set({ claimed_by_run: run.runId }).where(eq(cards.id, id))
}

const NewCard = t.Object({
  ref: t.Optional(
    t.String({
      description: 'A name for this card inside the batch, for waits_on of other cards in it',
    }),
  ),
  project_id: t.Integer(),
  title: t.String({ minLength: 1, maxLength: 300 }),
  body: t.Optional(t.String({ description: 'Markdown' })),
  tags: t.Optional(t.Array(t.String())),
  human: t.Optional(
    t.Boolean({ description: 'A person takes this card; the worker never picks it' }),
  ),
  priority: t.Optional(t.Integer({ description: 'Higher is picked first' })),
  waits_on: t.Optional(
    t.Array(t.Union([t.Integer(), t.String()]), {
      description: 'Card ids, or refs of cards in this batch, that must be done first',
    }),
  ),
})

export const cardRoutes = (ctx: AppContext) => {
  /**
   * What a tool call may not do to a card, whoever makes it: end a review (the person's decision,
   * so Claude cannot pass its own work) or take back a card a person holds.
   */
  const toolWrite = async (
    request: Request,
    id: number,
    change: { leavesReview?: boolean; human?: boolean | undefined },
  ) => {
    if (!isToolCall(request)) return
    await onlyItsCard(ctx, request, id)
    const card = await getCard(ctx.db, id)
    if (change.leavesReview && card.status === 'review')
      throw invalid('REVIEW_IS_THE_PERSONS', `card #${String(id)} is in review; the owner decides`)
    if (change.human === false && card.human)
      throw invalid('HELD_BY_A_PERSON', `card #${String(id)} is a person's; only they hand it back`)
  }

  return (
    new Elysia()
      .use(
        idempotency({
          store: pgStore({ db: ctx.db, table: idempotencyKeys }),
          // one person per install: the web app, the API token and MCP all act as the owner
          scope: () => 'owner',
        }),
      )
      .use(liveMacro(ctx.live))
      .get(
        '/cards',
        ({ query, request }) => {
          // A tool call's answer is read by a model, word by word: the bodies of a whole board
          // are megabytes of it. A tool gets titles, and at most TOOL_CARDS of them, unless it
          // asks for more; get_card has one card in full.
          const tool = isToolCall(request)
          return listCards(ctx.db, {
            ...query,
            lean: query.lean ?? tool,
            limit: query.limit ?? (tool ? TOOL_CARDS : undefined),
          })
        },
        {
          query: t.Object({
            project_id: t.Optional(
              t.Numeric({ description: 'Only this project (list_projects for ids)' }),
            ),
            status: t.Optional(Status),
            tag: t.Optional(t.String({ description: 'Only cards with this tag' })),
            q: t.Optional(t.String({ description: 'Text in the title or body' })),
            archived: t.Optional(t.BooleanString({ description: 'true: archived cards instead' })),
            lean: t.Optional(
              t.BooleanString({
                description:
                  "false: with each card's body (long; get_card has one card in full). Bodies are left out by default",
              }),
            ),
            limit: t.Optional(
              t.Numeric({
                minimum: 1,
                maximum: 1000,
                description: `At most this many cards (default ${String(TOOL_CARDS)}); narrow by project, status, tag or q instead of raising it`,
              }),
            ),
          }),
          live: liveRoute(ctx.live, {
            topics: () => ['cards', 'card_waits_on', 'runs@status=running'],
            key: 'id',
          }),
          detail: {
            operationId: 'list_cards',
            summary:
              'Find cards by project, status, tag or text: their titles, tags and status, without bodies (get_card for one in full)',
            mcp: true,
          },
        },
      )
      .get('/cards/:id', ({ params }) => getCard(ctx.db, Number(params.id)), {
        params: Id,
        live: liveRoute(ctx.live, {
          topics: ({ params }) => {
            const id = params['id'] ?? ''
            return [
              `cards:${id}`,
              `comments@card_id=${id}`,
              `card_waits_on@card_id=${id}`,
              `runs@card_id=${id}`,
              `attachments@card_id=${id}`,
              'cards', // the status of the cards it waits on
            ]
          },
        }),
        detail: {
          operationId: 'get_card',
          summary: 'A card with its comments, what it waits on, its last run and its attachments',
          mcp: true,
        },
      })
      .post('/cards/batch', ({ body }) => createCards(ctx.db, body.cards), {
        body: t.Object({
          cards: t.Array(NewCard, {
            minItems: 1,
            maxItems: 50,
            description: 'The cards to create, 1 to 50',
          }),
        }),
        headers: IdempotencyHeader,
        idempotent: true,
        detail: {
          operationId: 'create_cards',
          summary: 'Create one or more cards; cards of one batch can wait on each other by ref',
          description: CARD_RULES,
          mcp: true,
        },
      })
      .patch(
        '/cards/:id',
        async ({ params, body, request }) => {
          await toolWrite(request, Number(params.id), { human: body.human })
          return updateCard(ctx.db, Number(params.id), body)
        },
        {
          params: Id,
          body: t.Object({
            title: t.Optional(t.String({ minLength: 1, maxLength: 300, description: 'New title' })),
            body: t.Optional(t.String({ description: 'New body, markdown; replaces the old one' })),
            tags: t.Optional(t.Array(t.String(), { description: 'Replaces the whole list' })),
            human: t.Optional(
              t.Boolean({ description: 'A person takes this card; the worker never picks it' }),
            ),
            priority: t.Optional(t.Integer({ description: 'Higher is picked first' })),
            waits_on: t.Optional(t.Array(t.Integer(), { description: 'Replaces the whole list' })),
          }),
          detail: {
            operationId: 'update_card',
            summary: 'Change a card: title, body, tags, human, priority, waits_on',
            mcp: true,
          },
        },
      )
      .post(
        '/cards/:id/move',
        async ({ params, body, request }) => {
          await toolWrite(request, Number(params.id), { leavesReview: true })
          const moved = await moveCard(ctx.db, Number(params.id), body)
          await holdIfAgent(ctx, request, Number(params.id), body.status)
          return moved
        },
        {
          params: Id,
          body: t.Object({
            status: Status,
            reason: t.Optional(
              t.String({
                description: 'Required for review: what the person deciding needs to know',
              }),
            ),
            position: t.Optional(
              t.Number({ description: 'Place in the column; the end when omitted' }),
            ),
          }),
          detail: {
            operationId: 'move_card',
            summary: 'Move a card to todo, doing, review or done',
            mcp: true,
          },
        },
      )
      .post(
        '/cards/:id/comments',
        async ({ params, body, request }) => {
          await onlyItsCard(ctx, request, Number(params.id))
          return addComment(ctx.db, Number(params.id), {
            ...authorOf(request, ctx.auth),
            body: body.body,
          })
        },
        {
          params: Id,
          body: t.Object({ body: t.String({ minLength: 1, description: 'Markdown' }) }),
          headers: IdempotencyHeader,
          idempotent: true,
          detail: { operationId: 'add_comment', summary: 'Comment on a card', mcp: true },
        },
      )
      .post(
        '/cards/:id/archive',
        async ({ params, request }) => {
          await toolWrite(request, Number(params.id), { leavesReview: true })
          return archiveCard(ctx.db, Number(params.id))
        },
        {
          params: Id,
          detail: {
            operationId: 'archive_card',
            summary: 'Archive a card (there is no delete)',
            mcp: true,
          },
        },
      )
      .post('/cards/:id/unarchive', ({ params }) => archiveCard(ctx.db, Number(params.id), false), {
        params: Id,
        detail: { operationId: 'unarchive_card', summary: 'Bring an archived card back' },
      })
      // Review decisions are the person's: never tools, so Claude cannot pass its own work.
      .post(
        '/cards/:id/send-back',
        ({ params, body }) => sendBack(ctx.db, Number(params.id), body.comment),
        {
          params: Id,
          body: t.Object({ comment: t.String({ minLength: 1 }) }),
          detail: {
            operationId: 'send_back_card',
            summary: 'Return a review card to todo with a comment',
          },
        },
      )
  )
}

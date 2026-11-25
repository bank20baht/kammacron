import { idempotency } from '@20baht/elysia-idempotency'
import { pgStore } from '@20baht/elysia-idempotency/pg'
import { isToolCall } from '@20baht/elysia-openapi-mcp'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import { CARD_STATUSES, idempotencyKeys, type CommentAuthor } from '../db/schema'
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
export const CARD_RULES = `A card tagged "claude" is picked up by an unattended Claude worker that commits and pushes to the default branch.
Tag a card "claude" only when the work is reversible, stays inside the repo, and has a clear done condition.
Work that touches security, data or migrations, release or deploy, a breaking API, money, or a product decision is for a person: set human=true.
When a task is mostly a person's, split what Claude can do alone into small "claude" cards and make the big card wait on them (waits_on).`

const Status = t.UnionEnum([...CARD_STATUSES], { description: 'todo, doing, review or done' })
const Id = t.Object({ id: t.Numeric({ description: 'Card number, as in #12' }) })
const IdempotencyHeader = t.Object({
  'idempotency-key': t.Optional(
    t.String({
      description: 'Send the same key when retrying, so the cards are not created twice',
    }),
  ),
})

/** Who wrote this: a tool call of the worker's run, another MCP client, or the web app. */
const authorOf = (request: Request): { author: CommentAuthor; run_id: number | null } => {
  if (!isToolCall(request)) return { author: 'user', run_id: null }
  const run = Number(request.headers.get('x-kammacron-run'))
  return Number.isInteger(run) && run > 0
    ? { author: 'claude-worker', run_id: run }
    : { author: 'mcp', run_id: null }
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

export const cardRoutes = (ctx: AppContext) =>
  new Elysia()
    .use(idempotency({ store: pgStore({ db: ctx.db, table: idempotencyKeys }) }))
    .get('/cards', ({ query }) => listCards(ctx.db, query), {
      query: t.Object({
        project_id: t.Optional(
          t.Numeric({ description: 'Only this project (list_projects for ids)' }),
        ),
        status: t.Optional(Status),
        tag: t.Optional(t.String({ description: 'Only cards with this tag' })),
        q: t.Optional(t.String({ description: 'Text in the title or body' })),
        archived: t.Optional(t.BooleanString({ description: 'true: archived cards instead' })),
      }),
      detail: {
        operationId: 'list_cards',
        summary: 'Find cards by project, status, tag or text',
        mcp: true,
      },
    })
    .get('/cards/:id', ({ params }) => getCard(ctx.db, params.id), {
      params: Id,
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
    .patch('/cards/:id', ({ params, body }) => updateCard(ctx.db, params.id, body), {
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
    })
    .post('/cards/:id/move', ({ params, body }) => moveCard(ctx.db, params.id, body), {
      params: Id,
      body: t.Object({
        status: Status,
        reason: t.Optional(
          t.String({ description: 'Required for review: what the person deciding needs to know' }),
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
    })
    .post(
      '/cards/:id/comments',
      ({ params, body, request }) =>
        addComment(ctx.db, params.id, { ...authorOf(request), body: body.body }),
      {
        params: Id,
        body: t.Object({ body: t.String({ minLength: 1, description: 'Markdown' }) }),
        headers: IdempotencyHeader,
        idempotent: true,
        detail: { operationId: 'add_comment', summary: 'Comment on a card', mcp: true },
      },
    )
    .post('/cards/:id/archive', ({ params }) => archiveCard(ctx.db, params.id), {
      params: Id,
      detail: {
        operationId: 'archive_card',
        summary: 'Archive a card (there is no delete)',
        mcp: true,
      },
    })
    .post('/cards/:id/unarchive', ({ params }) => archiveCard(ctx.db, params.id, false), {
      params: Id,
      detail: { operationId: 'unarchive_card', summary: 'Bring an archived card back' },
    })
    // Review decisions are the person's: never tools, so Claude cannot pass its own work.
    .post('/cards/:id/send-back', ({ params, body }) => sendBack(ctx.db, params.id, body.comment), {
      params: Id,
      body: t.Object({ comment: t.String({ minLength: 1 }) }),
      detail: {
        operationId: 'send_back_card',
        summary: 'Return a review card to todo with a comment',
      },
    })

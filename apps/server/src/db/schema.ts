import { idempotencyTable } from '@20baht/elysia-idempotency/pg'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/** One row (id = 1): the switches of the whole install. */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  api_token_hash: text('api_token_hash').notNull(),
  paused: boolean('paused').notNull().default(false),
  stale_minutes: integer('stale_minutes').notNull().default(60),
  run_log_retention_days: integer('run_log_retention_days').notNull().default(30),
  allowed_hosts: text('allowed_hosts').array().notNull().default([]),
  ...timestamps,
})

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  repo_path: text('repo_path'),
  default_branch: text('default_branch'),
  worker_enabled: boolean('worker_enabled').notNull().default(false),
  interval_minutes: integer('interval_minutes').notNull().default(30),
  next_run_at: timestamp('next_run_at', { withTimezone: true }),
  last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
  last_check_result: text('last_check_result'),
  max_cards_per_run: integer('max_cards_per_run').notNull().default(3),
  max_turns: integer('max_turns').notNull().default(60),
  model: text('model'),
  extra_prompt: text('extra_prompt').notNull().default(''),
  allowed_bash: text('allowed_bash').array().notNull().default([]),
  copy_files: text('copy_files')
    .array()
    .notNull()
    .default(['.mcp.json', '.claude/settings.local.json']),
  setup_command: text('setup_command'),
  verify_command: text('verify_command'),
  enabled_mcp_servers: text('enabled_mcp_servers').array().notNull().default([]),
  web_tools: boolean('web_tools').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  ...timestamps,
})

export const CARD_STATUSES = ['todo', 'doing', 'review', 'done'] as const
export type CardStatus = (typeof CARD_STATUSES)[number]

export const cards = pgTable(
  'cards',
  {
    id: serial('id').primaryKey(),
    project_id: integer('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    status: text('status', { enum: CARD_STATUSES }).notNull().default('todo'),
    tags: text('tags').array().notNull().default([]),
    human: boolean('human').notNull().default(false),
    priority: integer('priority').notNull().default(0),
    position: doublePrecision('position').notNull().default(0),
    review_reason: text('review_reason'),
    branch: text('branch'),
    stale_count: integer('stale_count').notNull().default(0),
    claimed_by_run: integer('claimed_by_run'),
    archived: boolean('archived').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('cards_project_status').on(t.project_id, t.status)],
)

export const cardWaitsOn = pgTable(
  'card_waits_on',
  {
    card_id: integer('card_id')
      .notNull()
      .references(() => cards.id),
    waits_on_id: integer('waits_on_id')
      .notNull()
      .references(() => cards.id),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.card_id, t.waits_on_id] })],
)

export const COMMENT_AUTHORS = ['user', 'claude-worker', 'mcp'] as const
export type CommentAuthor = (typeof COMMENT_AUTHORS)[number]

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    card_id: integer('card_id')
      .notNull()
      .references(() => cards.id),
    author: text('author', { enum: COMMENT_AUTHORS }).notNull(),
    run_id: integer('run_id'),
    body: text('body').notNull(),
    ...timestamps,
  },
  (t) => [index('comments_card').on(t.card_id)],
)

export const RUN_STATUSES = [
  'running',
  'verifying',
  'succeeded',
  'review',
  'failed',
  'stopped',
  'stale',
  'reverted',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const runs = pgTable(
  'runs',
  {
    id: serial('id').primaryKey(),
    project_id: integer('project_id')
      .notNull()
      .references(() => projects.id),
    card_id: integer('card_id')
      .notNull()
      .references(() => cards.id),
    status: text('status', { enum: RUN_STATUSES }).notNull().default('running'),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    num_turns: integer('num_turns'),
    cost_usd: doublePrecision('cost_usd'),
    usage: jsonb('usage'),
    session_id: text('session_id'),
    commits: text('commits').array().notNull().default([]),
    pushed_to: text('pushed_to'),
    revert_commit: text('revert_commit'),
    exit_code: integer('exit_code'),
    error: text('error'),
    log_path: text('log_path'),
    ...timestamps,
  },
  (t) => [index('runs_card').on(t.card_id), index('runs_project').on(t.project_id)],
)

export const RUN_EVENT_TYPES = ['assistant', 'tool_use', 'tool_result', 'system', 'result'] as const
export type RunEventType = (typeof RUN_EVENT_TYPES)[number]

export const runEvents = pgTable(
  'run_events',
  {
    id: serial('id').primaryKey(),
    run_id: integer('run_id')
      .notNull()
      .references(() => runs.id),
    seq: integer('seq').notNull(),
    type: text('type', { enum: RUN_EVENT_TYPES }).notNull(),
    summary: text('summary').notNull(),
    data: jsonb('data'),
    ...timestamps,
  },
  (t) => [index('run_events_run_seq').on(t.run_id, t.seq)],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    card_id: integer('card_id').references(() => cards.id),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    filename: text('filename').notNull(),
    uploaded_by: text('uploaded_by', { enum: ['user', 'mcp'] }).notNull(),
    ...timestamps,
  },
  (t) => [index('attachments_card').on(t.card_id)],
)

export const idempotencyKeys = idempotencyTable()

export const schema = {
  settings,
  projects,
  cards,
  cardWaitsOn,
  comments,
  runs,
  runEvents,
  attachments,
  idempotencyKeys,
}

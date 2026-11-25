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
  /** PATH for `claude`, `git` and hooks: the shell's, saved when the service was installed. */
  worker_path: text('worker_path'),
  /** How many cards run at once across projects (one per project at most). */
  concurrency: integer('concurrency').notNull().default(1),
  webhook_url: text('webhook_url'),
  desktop_notifications: boolean('desktop_notifications').notNull().default(true),
  /**
   * The URL people and claude.ai reach this install at (a tunnel). Set, it turns on OAuth for
   * /mcp (claude.ai and Claude Desktop connect through it) and its host is allowed. Read at start.
   */
  public_url: text('public_url'),
  ...timestamps,
})

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  repo_path: text('repo_path'),
  default_branch: text('default_branch'),
  worker_enabled: boolean('worker_enabled').notNull().default(false),
  /** Paused by the program (a push outside the allowed refs, main broken, revert refused). */
  paused_reason: text('paused_reason'),
  /** watch: ask when unsure; autopilot: decide reversible things and say so in a comment. */
  mode: text('mode', { enum: ['watch', 'autopilot'] })
    .notNull()
    .default('autopilot'),
  /** push: Claude pushes to the default branch; branch: only to claude/<card>, a person merges. */
  ship_policy: text('ship_policy', { enum: ['push', 'branch'] })
    .notNull()
    .default('push'),
  /**
   * false: Claude works in `repo_path` itself, on the branch it is on, and a round is skipped while
   * it has uncommitted changes. true: in a worktree of its own, from the default branch.
   */
  use_worktree: boolean('use_worktree').notNull().default(false),
  /** Where the worktree lives (with use_worktree); `<data>/worktrees/<slug>` when null. */
  worktree_path: text('worktree_path'),
  /** Files hashed to decide whether `setup_command` runs again. */
  lock_files: text('lock_files')
    .array()
    .notNull()
    .default(['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']),
  setup_hash: text('setup_hash'),
  verify_timeout_minutes: integer('verify_timeout_minutes').notNull().default(15),
  /**
   * The gate before the default branch: with either set, Claude pushes only to claude/<card>, and
   * kammacron pushes it on when the diff is at most this many lines and touches no protected path.
   */
  max_diff_lines: integer('max_diff_lines'),
  protected_paths: text('protected_paths').array().notNull().default([]),
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
    /** origin/<default> when the run began: what verify and revert compare with. */
    base_sha: text('base_sha'),
    head_sha: text('head_sha'),
    /** The worker's last words (`result` of stream-json). */
    summary: text('summary'),
    /** Tool calls the allowlist refused: what `allowed_bash` may be missing. */
    permission_denials: jsonb('permission_denials'),
    /** auth | rate_limit | max_turns | timeout | crash, when the run did not end normally. */
    error_kind: text('error_kind'),
    verify_output: text('verify_output'),
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

export const ALERT_LEVELS = ['info', 'warning', 'error'] as const

/** What the program wants the person to see: a pause it made, a revert, a run that broke. */
export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  level: text('level', { enum: ALERT_LEVELS }).notNull(),
  project_id: integer('project_id').references(() => projects.id),
  card_id: integer('card_id').references(() => cards.id),
  run_id: integer('run_id').references(() => runs.id),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  ...timestamps,
})

/**
 * A command run on a schedule that opens a card when it fails (nightly tests, a link check):
 * work for the board found without anyone filing it.
 */
export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  command: text('command').notNull(),
  interval_minutes: integer('interval_minutes').notNull().default(1440),
  next_run_at: timestamp('next_run_at', { withTimezone: true }),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  last_exit_code: integer('last_exit_code'),
  /** The card it opened last; while that card is open, a failure comments on it instead. */
  last_card_id: integer('last_card_id').references(() => cards.id),
  card_tags: text('card_tags').array().notNull().default(['claude']),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
})

/** `@20baht/elysia-oauth-provider`'s storage: one key-value table, with expiry. */
export const oauthKv = pgTable(
  'oauth_kv',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('oauth_kv_expires').on(t.expires_at)],
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
  alerts,
  schedules,
  oauthKv,
  idempotencyKeys,
}

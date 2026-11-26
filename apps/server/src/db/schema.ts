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

/** A step that runs a shell command in the project's directory (ssh, tests, deploys: anything). */
export type RunStep = {
  kind: 'run'
  name: string
  command: string
  timeout_minutes?: number
  continue_on_error?: boolean
}

/** The Claude step: one `claude -p` on the card, with the worker's rules and tools. */
export type ClaudeStep = {
  kind: 'claude'
  name: string
  /** Added after the card, for this step only. */
  prompt?: string
  model?: string
  max_turns?: number
  /** More Bash patterns this step may run, as in `allowed_bash`. */
  allow?: string[]
}

export type PlaybookStep = RunStep | ClaudeStep

/** A named list of steps. A card runs `default`, or the one its `playbook:<name>` tag names. */
export type Playbook = { name: string; steps: PlaybookStep[] }

export const DEFAULT_PLAYBOOK_NAME = 'default'
export const PLAYBOOK_TAG = 'playbook:'
/** The tag that opens a card to agents: the worker's rounds and agent schedules take it. */
export const AUTOPILOT_TAG = 'auto-pilot'

/** The coding agents a schedule can run. */
export const AGENTS = ['claude', 'codex'] as const
export type Agent = (typeof AGENTS)[number]

export const DEFAULT_PLAYBOOKS: Playbook[] = [
  { name: DEFAULT_PLAYBOOK_NAME, steps: [{ kind: 'claude', name: 'Claude' }] },
]

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** The directory runs happen in: kammacron points there and leaves the rest to the playbook. */
  repo_path: text('repo_path'),
  worker_enabled: boolean('worker_enabled').notNull().default(false),
  /** Paused by the program; cleared with resume. */
  paused_reason: text('paused_reason'),
  /** watch: ask when unsure; autopilot: decide reversible things and say so in a comment. */
  mode: text('mode', { enum: ['watch', 'autopilot'] })
    .notNull()
    .default('autopilot'),
  /** What a run does with a card, step by step: `default`, and others a card picks by tag. */
  playbooks: jsonb('playbooks').$type<Playbook[]>().notNull().default(DEFAULT_PLAYBOOKS),
  interval_minutes: integer('interval_minutes').notNull().default(30),
  next_run_at: timestamp('next_run_at', { withTimezone: true }),
  last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
  last_check_result: text('last_check_result'),
  max_cards_per_run: integer('max_cards_per_run').notNull().default(3),
  max_turns: integer('max_turns').notNull().default(60),
  model: text('model'),
  extra_prompt: text('extra_prompt').notNull().default(''),
  allowed_bash: text('allowed_bash').array().notNull().default([]),
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
  'succeeded',
  'review',
  'failed',
  'stopped',
  'stale',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const runs = pgTable(
  'runs',
  {
    id: serial('id').primaryKey(),
    project_id: integer('project_id')
      .notNull()
      .references(() => projects.id),
    /** The card a worker round ran; null for an agent schedule's run, which has none. */
    card_id: integer('card_id').references(() => cards.id),
    /** The agent schedule that started this run; null for a worker round's. */
    schedule_id: integer('schedule_id').references(() => schedules.id),
    agent: text('agent', { enum: AGENTS }).notNull().default('claude'),
    status: text('status', { enum: RUN_STATUSES }).notNull().default('running'),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    num_turns: integer('num_turns'),
    cost_usd: doublePrecision('cost_usd'),
    usage: jsonb('usage'),
    session_id: text('session_id'),
    /** The worker's last words (`result` of stream-json). */
    summary: text('summary'),
    /** Tool calls the allowlist refused: what `allowed_bash` may be missing. */
    permission_denials: jsonb('permission_denials'),
    /** auth | rate_limit | max_turns | stopped | crash | step, when the run did not end normally. */
    error_kind: text('error_kind'),
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

export const STEP_STATUSES = ['running', 'succeeded', 'failed', 'stopped', 'skipped'] as const
export type StepStatus = (typeof STEP_STATUSES)[number]

/** One step of a run's playbook: what ran, how it ended, and the end of what it printed. */
export const runSteps = pgTable(
  'run_steps',
  {
    id: serial('id').primaryKey(),
    run_id: integer('run_id')
      .notNull()
      .references(() => runs.id),
    /** Position in the playbook, from 0. */
    position: integer('position').notNull(),
    kind: text('kind', { enum: ['claude', 'codex', 'run'] }).notNull(),
    name: text('name').notNull(),
    command: text('command'),
    status: text('status', { enum: STEP_STATUSES }).notNull().default('running'),
    exit_code: integer('exit_code'),
    /** The last 8 000 characters of stdout and stderr (a run step); the whole is in the run's log. */
    output: text('output'),
    started_at: timestamp('started_at', { withTimezone: true }),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('run_steps_run').on(t.run_id, t.position)],
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
 * A cron job of a project. It runs exactly one of: a shell command (a failure opens a card), a
 * playbook (a card each time, which the worker runs), or an agent (Claude or Codex with the
 * schedule's own prompt, in the project directory, with the board's MCP tools).
 */
export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  /** A shell command whose failure opens a card. */
  command: text('command'),
  /** A playbook to run on the interval: each time, a card tagged `playbook:<name>` the worker runs. */
  playbook: text('playbook'),
  /** An agent to run with `prompt`. */
  agent: text('agent', { enum: AGENTS }),
  prompt: text('prompt'),
  /** An agent's prompt comes with the board: the auto-pilot cards and how to take one. */
  use_board: boolean('use_board').notNull().default(true),
  /** An agent's model; null: the agent's own default. */
  model: text('model'),
  /** When it runs: a 5-field cron expression (local time), or null for every `interval_minutes`. */
  cron: text('cron'),
  interval_minutes: integer('interval_minutes').notNull().default(1440),
  next_run_at: timestamp('next_run_at', { withTimezone: true }),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  last_exit_code: integer('last_exit_code'),
  /** How the last time ended, in a few words (`exit 1`, `run 12 succeeded`). */
  last_result: text('last_result'),
  /** The card it opened last; while that card is open, a failure comments on it instead. */
  last_card_id: integer('last_card_id').references(() => cards.id),
  /** An agent schedule's last run. */
  last_run_id: integer('last_run_id'),
  card_tags: text('card_tags').array().notNull().default([AUTOPILOT_TAG]),
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

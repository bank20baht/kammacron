import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { liveTriggers, pgliteListener, postgresJsListener, type PgListener } from '@20baht/live/pg'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import {
  alerts,
  attachments,
  cards,
  cardWaitsOn,
  comments,
  projects,
  runEvents,
  runSteps,
  runs,
  schedules,
  schema,
  settings,
} from './schema'

/** Either driver: PGlite in the data dir (the default) or Postgres at DATABASE_URL. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
/** A drizzle transaction of `Db`: what services take when they join a caller's transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Either: a service call works alone (`db`) or inside one (`tx`). */
export type Executor = Db | Tx

export type Database = {
  kind: 'pglite' | 'postgres'
  db: Db
  /** Where `@20baht/live` hears the triggers' NOTIFY. */
  listener: PgListener
  close: () => Promise<void>
}

/**
 * The migrations: KAMMACRON_MIGRATIONS (the compiled binary unpacks them there), beside the bundle
 * in the npm package (`./drizzle`), or at the app root in the repo.
 */
const migrationsDir = () =>
  [
    process.env['KAMMACRON_MIGRATIONS'],
    fileURLToPath(new URL('./drizzle', import.meta.url)),
    fileURLToPath(new URL('../../drizzle', import.meta.url)),
  ].find((dir) => dir !== undefined && existsSync(join(dir, 'meta', '_journal.json'))) ??
  fileURLToPath(new URL('../../drizzle', import.meta.url))

/** PGlite's wasm and data, when they are not files beside its module (the compiled binary). */
type PgliteAssets = {
  pgliteWasmModule?: WebAssembly.Module
  initdbWasmModule?: WebAssembly.Module
  fsBundle?: Blob
}
let pgliteAssets: PgliteAssets = {}
/**
 * Hands PGlite its embedded files. @public: called by the entry `scripts/compile.ts` generates.
 */
export const usePgliteAssets = (assets: PgliteAssets) => {
  pgliteAssets = assets
}

/**
 * Every write to these tables notifies `@20baht/live` on commit (`<table>`, `<table>:<id>`, and
 * `<table>@<column>=<value>` for each scope column). Installed on every boot: the SQL replaces
 * what it made, so the triggers never drift from the schema.
 */
const LIVE_TABLES = [
  { table: settings },
  { table: projects },
  { table: cards, scope: [cards.project_id, cards.status] },
  { table: cardWaitsOn, key: ['card_id', 'waits_on_id'], scope: [cardWaitsOn.card_id] },
  { table: comments, scope: [comments.card_id] },
  { table: runs, scope: [runs.card_id, runs.project_id, runs.status] },
  { table: runEvents, scope: [runEvents.run_id] },
  { table: runSteps, scope: [runSteps.run_id] },
  { table: attachments, scope: [attachments.card_id] },
  { table: alerts },
  { table: schedules },
]

/** Opens PGlite at `dataDir` (in memory when omitted), migrated and with live triggers. */
export const openDatabase = async (
  dataDir?: string,
  migrationsFolder = migrationsDir(),
): Promise<Database> => {
  const client = new PGlite(dataDir, pgliteAssets)
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder })
  await client.exec(liveTriggers(LIVE_TABLES))
  return { kind: 'pglite', db, listener: pgliteListener(client), close: () => client.close() }
}

/**
 * Postgres at `url` (DATABASE_URL): a pool for queries, and one connection of its own for LISTEN,
 * so several kammacron processes could share it. The data dir still holds secrets, logs and files.
 */
export const openPostgres = async (
  url: string,
  migrationsFolder = migrationsDir(),
): Promise<Database> => {
  const pool = postgres(url, { max: 10, onnotice: () => undefined })
  const listen = postgres(url, { max: 1, onnotice: () => undefined })
  const db = drizzlePostgres(pool, { schema })
  await migratePostgres(db, { migrationsFolder })
  await pool.unsafe(liveTriggers(LIVE_TABLES))
  return {
    kind: 'postgres',
    db,
    listener: postgresJsListener(listen),
    close: async () => {
      await listen.end({ timeout: 5 })
      await pool.end({ timeout: 5 })
    },
  }
}

/** The row an `insert … returning` or `update … returning` of one row gave back. */
export const firstRow = <T>(rows: readonly T[]): T => {
  const [row] = rows
  if (row === undefined) throw new Error('expected a row back from the database')
  return row
}

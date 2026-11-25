import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { liveTriggers } from '@20baht/live/pg'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import {
  alerts,
  attachments,
  cards,
  cardWaitsOn,
  comments,
  projects,
  runEvents,
  runs,
  schedules,
  schema,
  settings,
} from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>
/** A drizzle transaction of `Db`: what services take when they join a caller's transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Either: a service call works alone (`db`) or inside one (`tx`). */
export type Executor = Db | Tx

export type Database = {
  client: PGlite
  db: Db
  close: () => Promise<void>
}

/** The migrations: beside the bundle in the npm package (`./drizzle`), at the app root in the repo. */
const MIGRATIONS =
  [
    fileURLToPath(new URL('./drizzle', import.meta.url)),
    fileURLToPath(new URL('../../drizzle', import.meta.url)),
  ].find((dir) => existsSync(join(dir, 'meta', '_journal.json'))) ??
  fileURLToPath(new URL('../../drizzle', import.meta.url))

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
  { table: attachments, scope: [attachments.card_id] },
  { table: alerts },
  { table: schedules },
]

/** Opens PGlite at `dataDir` (in memory when omitted), migrated and with live triggers. */
export const openDatabase = async (
  dataDir?: string,
  migrationsFolder = MIGRATIONS,
): Promise<Database> => {
  const client = new PGlite(dataDir)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await client.exec(liveTriggers(LIVE_TABLES))
  return { client, db, close: () => client.close() }
}

/** The row an `insert … returning` or `update … returning` of one row gave back. */
export const firstRow = <T>(rows: readonly T[]): T => {
  const [row] = rows
  if (row === undefined) throw new Error('expected a row back from the database')
  return row
}

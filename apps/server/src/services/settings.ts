import type { RetentionKey } from './retention'
import { eq } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import { settings } from '../db/schema'
import { hashToken, newToken, readSecrets, writeSecrets, type Secrets } from '../secrets'

export type Settings = typeof settings.$inferSelect

export const getSettings = async (db: Executor): Promise<Settings> => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  if (!row) throw new Error('settings row missing: call ensureSecrets on boot')
  return row
}

/**
 * On boot: makes `secrets.json` and the settings row on first start, and on later starts
 * checks they still agree (a restored DB with another install's secrets would lock the user out).
 */
export const ensureSecrets = async (db: Executor, path: string): Promise<Secrets> => {
  let secrets = await readSecrets(path)
  if (!secrets) {
    secrets = { api_token: newToken(), session_secret: newToken() }
    await writeSecrets(path, secrets)
  }
  const hash = hashToken(secrets.api_token)
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  if (!row) await db.insert(settings).values({ id: 1, api_token_hash: hash })
  else if (row.api_token_hash !== hash)
    await db.update(settings).set({ api_token_hash: hash }).where(eq(settings.id, 1))
  return secrets
}

/** A new API token; the old one stops working at once. Also renews the session cookie. */
export const rotateToken = async (
  db: Executor,
  path: string,
  current: Secrets,
): Promise<Secrets> => {
  const next: Secrets = { ...current, api_token: newToken(), session_secret: newToken() }
  await writeSecrets(path, next)
  await db
    .update(settings)
    .set({ api_token_hash: hashToken(next.api_token) })
    .where(eq(settings.id, 1))
  return next
}

export const updateSettings = async (
  db: Executor,
  patch: Partial<
    Pick<
      Settings,
      | 'paused'
      | 'stale_minutes'
      | RetentionKey
      | 'allowed_hosts'
      | 'worker_path'
      | 'concurrency'
      | 'webhook_url'
      | 'desktop_notifications'
      | 'public_url'
    >
  >,
) => {
  return firstRow(await db.update(settings).set(patch).where(eq(settings.id, 1)).returning())
}

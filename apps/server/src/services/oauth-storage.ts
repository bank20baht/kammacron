import type { OAuthStorage } from '@20baht/elysia-oauth-provider'
import { and, eq, gt, isNull, like, lt, or, sql } from 'drizzle-orm'

import type { Db } from '../db'
import { oauthKv } from '../db/schema'

const live = () => or(isNull(oauthKv.expires_at), gt(oauthKv.expires_at, sql`now()`))
const expiry = (ttlSeconds?: number) =>
  ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * The OAuth provider's key-value store on this install's own database (PGlite or Postgres). Each
 * atomic primitive is one statement, so of two racing callers exactly one wins.
 */
export const dbOAuthStorage = (db: Db): OAuthStorage => ({
  async get<T>(key: string) {
    const [row] = await db
      .select({ value: oauthKv.value })
      .from(oauthKv)
      .where(and(eq(oauthKv.key, key), live()))
    return (row?.value ?? null) as T | null
  },
  async set(key: string, value: unknown, opts?: { ttlSeconds?: number }) {
    const expires_at = expiry(opts?.ttlSeconds)
    await db
      .insert(oauthKv)
      .values({ key, value, expires_at })
      .onConflictDoUpdate({ target: oauthKv.key, set: { value, expires_at } })
  },
  async delete(key: string) {
    await db.delete(oauthKv).where(eq(oauthKv.key, key))
  },
  async list(prefix: string) {
    const rows = await db
      .select({ key: oauthKv.key })
      .from(oauthKv)
      .where(and(like(oauthKv.key, `${escapeLike(prefix)}%`), live()))
    return rows.map((r) => r.key)
  },
  async consume<T>(key: string) {
    const [row] = await db
      .delete(oauthKv)
      .where(and(eq(oauthKv.key, key), live()))
      .returning({ value: oauthKv.value })
    return (row?.value ?? null) as T | null
  },
  async compareAndSet(
    key: string,
    expectedVersion: number,
    value: { version: number },
    opts?: { ttlSeconds?: number },
  ) {
    const rows = await db
      .update(oauthKv)
      .set({ value, expires_at: expiry(opts?.ttlSeconds) })
      .where(
        and(
          eq(oauthKv.key, key),
          live(),
          sql`(${oauthKv.value}->>'version')::int = ${expectedVersion}`,
        ),
      )
      .returning({ key: oauthKv.key })
    return rows.length === 1
  },
  async compareAndDelete(key: string, expectedVersion: number) {
    const rows = await db
      .delete(oauthKv)
      .where(
        and(
          eq(oauthKv.key, key),
          live(),
          sql`(${oauthKv.value}->>'version')::int = ${expectedVersion}`,
        ),
      )
      .returning({ key: oauthKv.key })
    return rows.length === 1
  },
})

/** Expired keys go (housekeeping). */
export const purgeOAuth = (db: Db) => db.delete(oauthKv).where(lt(oauthKv.expires_at, sql`now()`))

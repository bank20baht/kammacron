import { count, desc, eq, inArray } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import { alerts } from '../db/schema'

type Alert = typeof alerts.$inferSelect
export type NewAlert = {
  level: Alert['level']
  message: string
  project_id?: number | null | undefined
  card_id?: number | null | undefined
  run_id?: number | null | undefined
}

export const addAlert = async (db: Executor, alert: NewAlert) =>
  firstRow(
    await db
      .insert(alerts)
      .values({
        level: alert.level,
        message: alert.message,
        project_id: alert.project_id ?? null,
        card_id: alert.card_id ?? null,
        run_id: alert.run_id ?? null,
      })
      .returning(),
  )

export const listAlerts = (db: Executor, { unread = false, limit = 50 } = {}) =>
  db
    .select()
    .from(alerts)
    .where(unread ? eq(alerts.read, false) : undefined)
    .orderBy(desc(alerts.id))
    .limit(limit)

/** How many the person has not read: all of them, not a page of them. */
export const countUnreadAlerts = async (db: Executor) => {
  const [row] = await db.select({ n: count() }).from(alerts).where(eq(alerts.read, false))
  return row?.n ?? 0
}

export const markAlertsRead = (db: Executor, ids: readonly number[]) =>
  ids.length === 0
    ? Promise.resolve()
    : db
        .update(alerts)
        .set({ read: true })
        .where(inArray(alerts.id, [...ids]))

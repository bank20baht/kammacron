import { eq } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import { schedules } from '../db/schema'
import { notFound } from './errors'

export type Schedule = typeof schedules.$inferSelect
type NewSchedule = Omit<typeof schedules.$inferInsert, 'project_id'>

export const listSchedules = (db: Executor, projectId: number) =>
  db.select().from(schedules).where(eq(schedules.project_id, projectId))

export const getSchedule = async (db: Executor, id: number): Promise<Schedule> => {
  const [row] = await db.select().from(schedules).where(eq(schedules.id, id))
  if (!row) throw notFound('schedule', id)
  return row
}

export const createSchedule = async (db: Executor, projectId: number, input: NewSchedule) =>
  firstRow(
    await db
      .insert(schedules)
      // a failure's card is for a person unless the schedule says who else takes it
      .values({ ...input, card_tags: input.card_tags ?? [], project_id: projectId })
      .returning(),
  )

export const updateSchedule = async (db: Executor, id: number, patch: Partial<NewSchedule>) => {
  const [row] = await db.update(schedules).set(patch).where(eq(schedules.id, id)).returning()
  if (!row) throw notFound('schedule', id)
  return row
}

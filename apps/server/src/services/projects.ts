import { asc, eq } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import { DEFAULT_PLAYBOOK_NAME, projects, type Playbook } from '../db/schema'
import { conflict, invalid, notFound } from './errors'

export type Project = typeof projects.$inferSelect
export type ProjectInput = Omit<
  typeof projects.$inferInsert,
  'id' | 'created_at' | 'updated_at' | 'last_checked_at' | 'last_check_result'
>
export type ProjectPatch = Partial<ProjectInput>

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

const checkSlug = (slug: string) => {
  if (!SLUG.test(slug))
    throw invalid(
      'BAD_SLUG',
      'slug: lowercase letters, digits and "-", starting with a letter or digit',
    )
}

/** Names unique, and one of them `default`: what a card without a playbook tag runs. */
const checkPlaybooks = (playbooks: readonly Playbook[] | undefined) => {
  if (!playbooks) return
  const names = playbooks.map((p) => p.name)
  const twice = names.find((name, i) => names.indexOf(name) !== i)
  if (twice) throw invalid('BAD_PLAYBOOKS', `two playbooks are named "${twice}"`)
  if (!names.includes(DEFAULT_PLAYBOOK_NAME))
    throw invalid('BAD_PLAYBOOKS', `one playbook must be named "${DEFAULT_PLAYBOOK_NAME}"`)
}

export const listProjects = (db: Executor, { archived = false } = {}) =>
  db.select().from(projects).where(eq(projects.archived, archived)).orderBy(asc(projects.name))

export const getProject = async (db: Executor, id: number): Promise<Project> => {
  const [row] = await db.select().from(projects).where(eq(projects.id, id))
  if (!row) throw notFound('project', id)
  return row
}

export const createProject = async (db: Executor, input: ProjectInput): Promise<Project> => {
  checkSlug(input.slug)
  checkPlaybooks(input.playbooks)
  const [taken] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, input.slug))
  if (taken) throw conflict('SLUG_TAKEN', `slug "${input.slug}" is taken`)
  return firstRow(await db.insert(projects).values(input).returning())
}

export const updateProject = async (
  db: Executor,
  id: number,
  patch: ProjectPatch,
): Promise<Project> => {
  if (patch.slug !== undefined) checkSlug(patch.slug)
  checkPlaybooks(patch.playbooks)
  await getProject(db, id)
  return firstRow(await db.update(projects).set(patch).where(eq(projects.id, id)).returning())
}

import { t } from 'elysia'

/**
 * A numeric `:id` path param, as digits. Not `t.Numeric()`: on a real `Bun.serve` (Elysia 1.4.32,
 * Bun 1.3.14) coercing a path param throws "Attempting to change configurable attribute of
 * unconfigurable property" and the route answers 500, while `app.handle` in tests is fine.
 * Handlers read it with `Number(params.id)`.
 */
export const idParams = (description?: string) =>
  t.Object({
    id: t.String({ pattern: '^[1-9][0-9]{0,9}$', ...(description ? { description } : {}) }),
  })

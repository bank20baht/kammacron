import { cors } from '@elysiajs/cors'
import { queryRows } from '@20baht/table-query'
import { tableRoute } from '@20baht/table-query/elysia'
import { formRoute } from '@20baht/validator/elysia'
import { Elysia } from 'elysia'
import { contactForm, contactTable, type ContactRow } from './forms/contact.form'

/** In dev the host and the remotes run on their own localhost ports; deployed, all share one origin. */
const DEV_ORIGIN = /^http:\/\/localhost:\d+$/

/**
 * The API under `/api`. Keep imports extensionless (`./x`, never `./x.ts`): the web apps compile
 * this file's declarations, and Angular's compiler rejects `.ts` specifiers.
 */
export const buildApp = () => {
  // Kept in memory, so the starter needs no database. A real app inserts a row in `POST /contact`
  // and answers `/contact/search` with SQL: `tableQueryOf(sql, contactTable, { … })`.
  const received: ContactRow[] = []

  return (
    new Elysia({ prefix: '/api' })
      .use(cors({ origin: DEV_ORIGIN, credentials: true }))
      .get('/hello', () => ({ message: 'Hello from the server' }))
      // A form: the schema the browser renders, and the same schema checking what comes back.
      .get('/contact/form', () => contactForm)
      // `formRoute` is the form as the route's body: a refused one answers `422 { issues }` before
      // the handler; `body` is what to keep (defaults filled, unknown keys dropped), typed from the form.
      .post(
        '/contact',
        ({ body }) => {
          // `2026-11-22 09:30`: text that reads as a time and still sorts and filters as a date
          const received_at = new Date().toISOString().slice(0, 16).replace('T', ' ')
          received.push({ ...body, received_at })
          return { received: body }
        },
        formRoute(contactForm),
      )
      // A table: its columns for the browser, and a page of its rows for a query (search, filter,
      // sort, page). `tableRoute` refuses a query that names a column the table does not have.
      .get('/contact/table', () => contactTable)
      .post('/contact/search', ({ body }) => queryRows(received, body), tableRoute(contactTable))
  )
}

import { buildApp } from './app'

const app = buildApp().listen(Number(process.env['PORT'] ?? 3001))

console.log(`server on http://localhost:${String(app.server?.port)}`)

/** What the web apps type their client with (through `dist/types`, `bun run build:types`). */
export type App = typeof app

/** The data of the forms the web apps send, derived from their schemas. */
export type { ContactMessage, ContactRow } from './forms/contact.form'

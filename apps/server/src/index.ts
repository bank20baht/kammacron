import { startServer } from './server'

const handle = await startServer()
console.log(`kammacron on ${handle.url}`)

const stop = async () => {
  await handle.stop()
  process.exit(0)
}
process.on('SIGTERM', () => void stop())
process.on('SIGINT', () => void stop())

/** What the web app types its client with (through `dist/types`, `bun run build:types`). */
export type { App } from './app'

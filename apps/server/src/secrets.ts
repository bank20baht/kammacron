import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * `secrets.json` (mode 600) beside the database: the values that must be read back in full.
 * The DB keeps only the API token's hash.
 */
export type Secrets = {
  /** The bearer token of `/api` and `/mcp` (also written into the worker's `--mcp-config`). */
  api_token: string
  /** The value of the web session cookie. */
  session_secret: string
}

export const newToken = () => randomBytes(32).toString('base64url')

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Constant-time equality of two strings (by their SHA-256, so lengths never leak either). */
export const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

export const secretsPath = (dataDir: string) => join(dataDir, 'secrets.json')

export const readSecrets = async (path: string): Promise<Secrets | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Secrets
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Written to a temp file at 600 then renamed, so a crash never leaves half a file. */
export const writeSecrets = async (path: string, secrets: Secrets) => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${String(process.pid)}.tmp`
  await writeFile(tmp, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, path)
}

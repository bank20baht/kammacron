import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { and, eq, inArray, isNull, lt } from 'drizzle-orm'

import { firstRow, type Executor } from '../db'
import { attachments } from '../db/schema'
import { invalid, notFound } from './errors'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** The only types kept, told by their first bytes; SVG is not one (it runs script). */
const KINDS = [
  {
    mime: 'image/png',
    ext: 'png',
    magic: (b: Uint8Array) => hasPrefix(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  { mime: 'image/jpeg', ext: 'jpg', magic: (b: Uint8Array) => hasPrefix(b, [0xff, 0xd8, 0xff]) },
  {
    mime: 'image/gif',
    ext: 'gif',
    magic: (b: Uint8Array) => hasPrefix(b, [0x47, 0x49, 0x46, 0x38]),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    magic: (b: Uint8Array) =>
      hasPrefix(b, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
] as const

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((byte, i) => bytes[i] === byte)
}

export const sniffImage = (bytes: Uint8Array) => KINDS.find((kind) => kind.magic(bytes)) ?? null

const extOf = (mime: string) => KINDS.find((kind) => kind.mime === mime)?.ext ?? 'bin'

/** Where an attachment's bytes live: named by their hash, so the same image is kept once. */
export const attachmentPath = (filesDir: string, row: { sha256: string; mime: string }) =>
  join(filesDir, `${row.sha256}.${extOf(row.mime)}`)

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const FILE_LINK = new RegExp(`/files/(${UUID})`, 'gi')

/** The attachment ids a markdown text links to (`![](/files/<id>)`). */
export const linkedIds = (text: string) => [
  ...new Set([...text.matchAll(FILE_LINK)].map((m) => (m[1] ?? '').toLowerCase())),
]

export const storeAttachment = async (
  db: Executor,
  filesDir: string,
  input: {
    bytes: Uint8Array
    filename: string
    uploaded_by: 'user' | 'mcp'
    card_id?: number | null | undefined
  },
) => {
  if (input.bytes.byteLength === 0) throw invalid('EMPTY_FILE', 'the file is empty')
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES)
    throw invalid(
      'FILE_TOO_LARGE',
      `files are limited to ${String(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`,
    )
  const kind = sniffImage(input.bytes)
  if (!kind) throw invalid('UNSUPPORTED_TYPE', 'only PNG, JPEG, GIF and WebP images are kept')
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  await mkdir(filesDir, { recursive: true, mode: 0o700 })
  const path = attachmentPath(filesDir, { sha256, mime: kind.mime })
  const tmp = `${path}.${String(process.pid)}.${String(Date.now())}.tmp`
  await writeFile(tmp, input.bytes, { mode: 0o600 })
  await rename(tmp, path)
  const filename = input.filename.replace(/[/\\\0]/g, '_').slice(0, 200) || `image.${kind.ext}`
  return firstRow(
    await db
      .insert(attachments)
      .values({
        sha256,
        mime: kind.mime,
        size: input.bytes.byteLength,
        filename,
        uploaded_by: input.uploaded_by,
        card_id: input.card_id ?? null,
      })
      .returning(),
  )
}

export const getAttachment = async (db: Executor, id: string) => {
  if (!new RegExp(`^${UUID}$`, 'i').test(id)) throw notFound('file', id)
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id.toLowerCase()))
  if (!row) throw notFound('file', id)
  return row
}

/** Ties the files a card's body or comment links to, that no card holds yet, to that card. */
export const linkAttachments = async (db: Executor, cardId: number, text: string) => {
  const ids = linkedIds(text)
  if (ids.length === 0) return
  await db
    .update(attachments)
    .set({ card_id: cardId })
    .where(and(inArray(attachments.id, ids), isNull(attachments.card_id)))
}

export const cardAttachments = (db: Executor, cardId: number) =>
  db.select().from(attachments).where(eq(attachments.card_id, cardId))

/**
 * Removes files nobody linked within `olderThanMs` (pasted, never saved). The bytes go only when no
 * other row shares their hash.
 */
export const purgeOrphans = async (
  db: Executor,
  filesDir: string,
  olderThanMs = 24 * 60 * 60 * 1000,
) => {
  const cutoff = new Date(Date.now() - olderThanMs)
  const gone = await db
    .delete(attachments)
    .where(and(isNull(attachments.card_id), lt(attachments.created_at, cutoff)))
    .returning()
  if (!gone.length) return 0
  // the hashes another row still holds, asked once rather than a count per removed row
  const hashes = [...new Set(gone.map((row) => row.sha256))]
  const kept = new Set(
    (
      await db
        .selectDistinct({ sha256: attachments.sha256 })
        .from(attachments)
        .where(inArray(attachments.sha256, hashes))
    ).map((row) => row.sha256),
  )
  const freed = new Map(gone.filter((row) => !kept.has(row.sha256)).map((row) => [row.sha256, row]))
  for (const row of freed.values()) await rm(attachmentPath(filesDir, row), { force: true })
  return gone.length
}

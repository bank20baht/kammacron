import { isToolCall } from '@20baht/elysia-openapi-mcp'
import { Elysia, t } from 'elysia'

import type { AppContext } from '../context'
import {
  attachmentPath,
  getAttachment,
  MAX_ATTACHMENT_BYTES,
  storeAttachment,
} from '../services/attachments'

const view = (row: { id: string; filename: string; mime: string; size: number }) => ({
  id: row.id,
  filename: row.filename,
  mime: row.mime,
  size: row.size,
  url: `/files/${row.id}`,
  markdown: `![${row.filename.replace(/[[\]]/g, '')}](/files/${row.id})`,
})

/** Uploads, under `/api`. */
export const fileApiRoutes = (ctx: AppContext) =>
  new Elysia()
    .post(
      '/files',
      async ({ body }) =>
        view(
          await storeAttachment(ctx.db, ctx.filesDir, {
            bytes: new Uint8Array(await body.file.arrayBuffer()),
            filename: body.file.name,
            uploaded_by: 'user',
          }),
        ),
      {
        body: t.Object({ file: t.File({ maxSize: MAX_ATTACHMENT_BYTES }) }),
        detail: {
          operationId: 'upload_file',
          summary: 'Upload an image (multipart), for markdown',
        },
      },
    )
    .post(
      '/files/base64',
      async ({ body, request }) => {
        const bytes = Buffer.from(body.data, 'base64')
        return view(
          await storeAttachment(ctx.db, ctx.filesDir, {
            bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            filename: body.filename,
            uploaded_by: isToolCall(request) ? 'mcp' : 'user',
          }),
        )
      },
      {
        body: t.Object({
          filename: t.String({ minLength: 1, maxLength: 200, description: 'e.g. screenshot.png' }),
          data: t.String({
            maxLength: Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4,
            description: 'The image, base64 (PNG, JPEG, GIF or WebP; up to 10 MB)',
          }),
        }),
        detail: {
          operationId: 'upload_image',
          summary:
            'Upload an image; put the returned markdown in a card body or a comment to show it',
          mcp: true,
        },
      },
    )

/** Downloads, at `/files/:id` (beside `/api`, so markdown links stay short). Guarded like `/api`. */
export const fileRoutes = (ctx: AppContext) =>
  new Elysia().get(
    '/files/:id',
    async ({ params }) => {
      const row = await getAttachment(ctx.db, params.id)
      const file = Bun.file(attachmentPath(ctx.filesDir, row))
      if (!(await file.exists()))
        return Response.json({ code: 'NOT_FOUND', message: 'file is gone' }, { status: 404 })
      return new Response(file, {
        headers: {
          'content-type': row.mime, // the type we found in its bytes, never one the uploader sent
          'x-content-type-options': 'nosniff',
          'content-security-policy': "sandbox; default-src 'none'",
          'cache-control': 'private, max-age=31536000, immutable',
          'content-disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
        },
      })
    },
    { params: t.Object({ id: t.String() }), detail: { hide: true } },
  )

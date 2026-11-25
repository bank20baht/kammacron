import type { UploadedFile } from '@20baht/ui'

/** A pasted or dropped image, kept by the server; `url` is what the markdown links to. */
export const uploadImage = async (file: File): Promise<UploadedFile> => {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/files', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  const body = (await response.json()) as {
    url?: string
    message?: string
    size?: number
    mime?: string
  }
  if (!response.ok || !body.url)
    throw new Error(body.message ?? `upload failed (${String(response.status)})`)
  return {
    name: file.name,
    size: body.size ?? file.size,
    type: body.mime ?? file.type,
    url: body.url,
  }
}

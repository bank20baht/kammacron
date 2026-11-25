const FALLBACK = 'Something went wrong. Try again.'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Where the response body sits: `value` from `unwrap()`, `error` on an `HttpErrorResponse`. */
const bodyOf = (error: Record<string, unknown>): Record<string, unknown> => {
  for (const key of ['value', 'error']) {
    const body = error[key]
    if (isRecord(body)) return body
  }
  return error
}

/** A form the server refused, `{ issues: [{ ref, message }] }`: the first thing wrong with it. */
const firstIssue = (body: Record<string, unknown>): string | null => {
  const issues = body['issues']
  const first: unknown = Array.isArray(issues) ? issues[0] : undefined
  if (!isRecord(first)) return null
  const { ref, message } = first
  return typeof ref === 'string' && typeof message === 'string' ? `${ref}: ${message}` : null
}

/**
 * The sentence to show for a failed API call: the server's `{ message }`, Elysia's validator
 * `{ summary }` or a refused form's first issue, as ngx-eden's `unwrap()` or a resource's
 * `error()` carries it.
 */
export const describeError = (error: unknown): string => {
  if (!isRecord(error)) return FALLBACK
  if (error['status'] === 0) return 'The server cannot be reached.'
  const body = bodyOf(error)
  for (const key of ['message', 'summary']) {
    const text = body[key]
    if (typeof text === 'string' && text !== '') return text
  }
  return firstIssue(body) ?? FALLBACK
}

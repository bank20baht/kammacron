import type { WritableSignal } from '@angular/core'
import { describeError } from '@kammacron/kit'

/**
 * A button's request: `busy` while it goes, and its failure said in words through `fail`. Gives
 * back what the request answered, in a box (so an answer of nothing still counts), or `null` when
 * it failed.
 */
export const attempt = async <T>(
  busy: WritableSignal<boolean>,
  fail: (message: string) => void,
  work: () => Promise<T>,
): Promise<{ value: T } | null> => {
  busy.set(true)
  try {
    return { value: await work() }
  } catch (error) {
    fail(describeError(error))
    return null
  } finally {
    busy.set(false)
  }
}

/** What a page says after a request: that it went through, or why it did not. */
export type Notice = { tone: 'success' | 'danger'; text: string }

/** `attempt`, for a page that says both ends in one notice. */
export const attemptWithNotice = async (
  busy: WritableSignal<boolean>,
  notice: WritableSignal<Notice | null>,
  work: () => Promise<string>,
): Promise<boolean> => {
  notice.set(null)
  const done = await attempt(
    busy,
    (text) => {
      notice.set({ tone: 'danger', text })
    },
    work,
  )
  if (done) notice.set({ tone: 'success', text: done.value })
  return done !== null
}

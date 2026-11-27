import type { LiveState } from '@20baht/live/browser'

/**
 * A live answer that never came: none has arrived, and the server answered with an error or the
 * stream is down. With an answer in hand the page keeps showing it (the client reconnects itself).
 */
export const liveFailed = (state: LiveState<unknown>): boolean =>
  state.data === undefined &&
  (state.error !== undefined || state.status === 'error' || state.status === 'offline')

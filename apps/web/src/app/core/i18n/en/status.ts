/** The names of card and run states, wherever they show. */
export const status = {
  card: { todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' },
  run: {
    running: 'running',
    verifying: 'verifying',
    succeeded: 'succeeded',
    review: 'review',
    failed: 'failed',
    stopped: 'stopped',
    stale: 'stale',
    reverted: 'reverted',
  },
} as const

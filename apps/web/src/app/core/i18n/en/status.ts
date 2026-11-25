/** The names of card, run and step states, wherever they show. */
export const status = {
  card: { todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' },
  run: {
    running: 'running',
    succeeded: 'succeeded',
    review: 'review',
    failed: 'failed',
    stopped: 'stopped',
    stale: 'stale',
  },
  step: {
    running: 'running',
    succeeded: 'passed',
    failed: 'failed',
    stopped: 'stopped',
    skipped: 'skipped',
  },
} as const

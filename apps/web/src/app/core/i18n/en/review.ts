/** The Review page: the queue of cards waiting on a decision. */
export const review = {
  heading: 'Review',
  count: { one: '{count} card needs a decision.', other: '{count} cards need a decision.' },
  empty: 'Nothing to review',
  emptyHint: 'Cards the worker hands back show up here.',
  loadError: 'The review queue did not load',
  loadErrorHint: 'The server could not be reached. Try again when it is back.',
  queue: 'To review',
  backToQueue: 'Back to the queue ({count})',
  next: 'Next card',
} as const

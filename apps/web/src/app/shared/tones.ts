import type { BadgeTone } from '@20baht/ui'

export type CardStatus = 'todo' | 'doing' | 'review' | 'done'

export const STATUS_LABEL: Record<CardStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
}

export const RUN_TONE: Record<string, BadgeTone> = {
  running: 'info',
  verifying: 'info',
  succeeded: 'success',
  review: 'warning',
  failed: 'danger',
  stopped: 'neutral',
  stale: 'neutral',
  reverted: 'danger',
}

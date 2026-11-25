import type { BadgeTone } from '@20baht/ui'

import type { Translate } from '../core/i18n/i18n.service'

export type CardStatus = 'todo' | 'doing' | 'review' | 'done'

/** A card status in the locale's words. */
export const statusLabel = (t: Translate, status: CardStatus): string => t(`status.card.${status}`)

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

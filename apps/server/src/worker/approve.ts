import { eq } from 'drizzle-orm'

import type { Db } from '../db'
import { cards } from '../db/schema'
import { addComment, moveCard } from '../services/cards'
import { invalid } from '../services/errors'

/**
 * Approve: the person read what the run left and agrees; the card is done. kammacron merges and
 * pushes nothing itself: where the work went is the playbook's business.
 */
export const approveCard = async (db: Db, cardId: number) => {
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId))
  if (!card) throw invalid('NOT_FOUND', `card #${String(cardId)} not found`)
  if (card.status !== 'review')
    throw invalid('NOT_IN_REVIEW', `card #${String(cardId)} is ${card.status}, not review`)
  await addComment(db, cardId, { author: 'user', body: 'Approved.' })
  return moveCard(db, cardId, { status: 'done' })
}

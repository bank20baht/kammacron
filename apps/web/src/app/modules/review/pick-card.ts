/**
 * The card the review page shows: `wanted` (from `?card=`), else the one shown before. One that
 * left the queue (approved, sent back) gives way to the card that came after it in the queue as
 * it was, else the one before it, so a decision moves on down the queue. A later answer (the
 * live list sends more than one) keeps that card; with nothing to go by, the first.
 */
export const pickCard = (
  ids: readonly number[],
  wanted: number | null,
  previous?: { ids: readonly number[]; shown: number | null },
): number | null => {
  const shown = previous?.shown ?? null
  const target = wanted ?? shown
  if (target !== null && ids.includes(target)) return target
  const before = previous?.ids ?? []
  const at = target === null ? -1 : before.indexOf(target)
  const stays = (id: number) => ids.includes(id)
  if (at >= 0) {
    const after = before.slice(at + 1).find(stays)
    const earlier = before.slice(0, at).reverse().find(stays)
    return after ?? earlier ?? ids[0] ?? null
  }
  return shown !== null && stays(shown) ? shown : (ids[0] ?? null)
}

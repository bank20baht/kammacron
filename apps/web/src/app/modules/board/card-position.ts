/**
 * Where a card dropped into a column sits: `column` is the column in order without the card
 * itself, `before` the card it was dropped in front of (null: at the end). Between two cards it
 * takes the middle; the server spreads a column out again when its cards get too close.
 */
export const positionAt = (
  column: readonly { id: number; position: number }[],
  before: number | null,
): number => {
  const found = before === null ? -1 : column.findIndex((c) => c.id === before)
  const at = found < 0 ? column.length : found
  const prev = column[at - 1]?.position
  const next = column[at]?.position
  if (prev === undefined) return next === undefined ? 1 : next - 1
  return next === undefined ? prev + 1 : (prev + next) / 2
}

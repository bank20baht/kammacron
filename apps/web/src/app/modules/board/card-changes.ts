import type { FormValues } from '@20baht/ui/engine'

import type { cardForm } from '../../shared/forms'

/** The tag that opens a card to agents (the worker's rounds and agent schedules). */
export const AUTOPILOT = 'auto-pilot'

/** The card form's data, as the form holds it. */
export type CardFormData = FormValues<ReturnType<typeof cardForm>>

/** What of a card its form shows. */
type CardFields = {
  title: string
  body: string
  status: string
  human: boolean
  priority: number
  tags: readonly string[]
  waits_on: readonly { id: number }[]
}

/** The card as the form holds it. */
export type CardFormValue = ReturnType<typeof formValueOf>

export const formValueOf = (card: CardFields) => ({
  title: card.title,
  body: card.body,
  status: card.status,
  owner: card.human ? 'human' : card.tags.includes(AUTOPILOT) ? 'autopilot' : 'none',
  priority: card.priority,
  tags: card.tags.filter((t) => t !== AUTOPILOT),
  waits_on: card.waits_on.map((w) => String(w.id)).join(', '),
})

export type CardPatch = {
  title?: string
  body?: string
  tags?: string[]
  human?: boolean
  priority?: number
  waits_on?: number[]
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i])

/**
 * What the person changed, and only that: the form was filled when the card was opened, and an
 * agent may have written to the card since. A field left alone is not sent, so it keeps what the
 * card has now. `tagsNow` are the card's tags as they are, for an owner changed without the tags.
 */
export const changesOf = (
  start: CardFormValue,
  data: Omit<CardFormData, 'status'>,
  tagsNow: readonly string[],
): CardPatch => {
  const patch: CardPatch = {}
  const title = data.title ?? ''
  if (title !== start.title) patch.title = title
  const body = data.body ?? ''
  if (body !== start.body) patch.body = body
  const priority = Math.round(data.priority ?? 0)
  if (priority !== start.priority) patch.priority = priority
  const waits = data.waits_on ?? ''
  if (waits !== start.waits_on)
    patch.waits_on = waits
      .split(/[\s,#]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
  const owner = data.owner ?? 'none'
  const tagsChanged = !sameList(data.tags, start.tags)
  if (owner !== start.owner) patch.human = owner === 'human'
  if (tagsChanged || owner !== start.owner) {
    const others = (tagsChanged ? data.tags : tagsNow).filter((t) => t !== AUTOPILOT)
    patch.tags = owner === 'autopilot' ? [AUTOPILOT, ...others] : others
  }
  return patch
}

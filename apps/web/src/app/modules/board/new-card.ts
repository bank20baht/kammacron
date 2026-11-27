import { AUTOPILOT } from './card-changes'

/** A new card as the API takes it: the owner picked becomes the `auto-pilot` tag or `human`. */
export const newCardBody = (input: {
  project_id: number
  title: string
  body?: string
  owner: string
  tags?: readonly string[]
}) => {
  const others = (input.tags ?? []).filter((t) => t !== AUTOPILOT)
  return {
    project_id: input.project_id,
    title: input.title,
    body: input.body ?? '',
    tags: input.owner === 'autopilot' ? [AUTOPILOT, ...others] : others,
    human: input.owner === 'human',
  }
}

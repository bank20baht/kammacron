import { changesOf, formValueOf } from './card-changes'

const card = {
  title: 'Fix the login',
  body: 'It fails on Safari.',
  status: 'todo',
  human: false,
  priority: 1,
  tags: ['auto-pilot', 'bug'],
  waits_on: [{ id: 3 }, { id: 7 }],
}

describe("a card's form", () => {
  it('shows the owner apart from the other tags', () => {
    expect(formValueOf(card)).toEqual({
      title: 'Fix the login',
      body: 'It fails on Safari.',
      status: 'todo',
      owner: 'autopilot',
      priority: 1,
      tags: ['bug'],
      waits_on: '3, 7',
    })
    expect(formValueOf({ ...card, human: true }).owner).toBe('human')
    expect(formValueOf({ ...card, tags: [] }).owner).toBe('none')
  })

  it('sends nothing when nothing was changed', () => {
    const start = formValueOf(card)
    expect(changesOf(start, { ...start }, card.tags)).toEqual({})
  })

  it('sends only the field the person changed', () => {
    const start = formValueOf(card)
    // an agent rewrote the body meanwhile: the form still holds the old one, and does not send it
    expect(changesOf(start, { ...start, priority: 5 }, card.tags)).toEqual({ priority: 5 })
    expect(changesOf(start, { ...start, body: 'New.' }, card.tags)).toEqual({ body: 'New.' })
    expect(changesOf(start, { ...start, waits_on: '#3 9' }, card.tags)).toEqual({
      waits_on: [3, 9],
    })
  })

  it('keeps the tags an agent added when only the owner changes', () => {
    const start = formValueOf(card)
    const now = ['auto-pilot', 'bug', 'needs-design']
    expect(changesOf(start, { ...start, owner: 'human' }, now)).toEqual({
      human: true,
      tags: ['bug', 'needs-design'],
    })
    expect(changesOf(formValueOf({ ...card, tags: ['bug'] }), { ...start }, ['bug', 'x'])).toEqual({
      human: false,
      tags: ['auto-pilot', 'bug', 'x'],
    })
  })

  it("sends the person's tags when they changed them", () => {
    const start = formValueOf(card)
    expect(changesOf(start, { ...start, tags: ['bug', 'ui'] }, ['auto-pilot', 'bug', 'x'])).toEqual(
      { tags: ['auto-pilot', 'bug', 'ui'] },
    )
  })
})

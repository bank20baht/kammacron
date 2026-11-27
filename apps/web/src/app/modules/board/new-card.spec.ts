import { newCardBody } from './new-card'

describe('a new card', () => {
  it("is the agents' when its owner is auto-pilot: the tag, once", () => {
    expect(
      newCardBody({ project_id: 2, title: 'Fix', owner: 'autopilot', tags: ['bug', 'auto-pilot'] }),
    ).toEqual({ project_id: 2, title: 'Fix', body: '', tags: ['auto-pilot', 'bug'], human: false })
  })

  it("is a person's when its owner is human: no tag, whatever was typed", () => {
    expect(
      newCardBody({
        project_id: 2,
        title: 'Decide',
        body: 'x',
        owner: 'human',
        tags: ['auto-pilot'],
      }),
    ).toEqual({ project_id: 2, title: 'Decide', body: 'x', tags: [], human: true })
  })
})

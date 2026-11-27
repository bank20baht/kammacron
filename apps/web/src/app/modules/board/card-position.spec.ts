import { positionAt } from './card-position'

const column = [
  { id: 1, position: 1 },
  { id: 2, position: 2 },
  { id: 3, position: 4 },
]

describe('where a dropped card sits', () => {
  it('is first in an empty column', () => {
    expect(positionAt([], null)).toBe(1)
  })

  it('goes after the last card when dropped on the column', () => {
    expect(positionAt(column, null)).toBe(5)
  })

  it('goes before the first card', () => {
    expect(positionAt(column, 1)).toBe(0)
  })

  it('takes the middle between two cards', () => {
    expect(positionAt(column, 2)).toBe(1.5)
    expect(positionAt(column, 3)).toBe(3)
  })

  it('goes to the end when the card it was dropped before is gone', () => {
    expect(positionAt(column, 99)).toBe(5)
  })
})

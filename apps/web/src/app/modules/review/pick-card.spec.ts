import { pickCard } from './pick-card'

describe('the review card shown', () => {
  it('is the one asked for, else the first', () => {
    expect(pickCard([3, 5, 8], 5)).toBe(5)
    expect(pickCard([3, 5, 8], null)).toBe(3)
    expect(pickCard([3, 5, 8], 99)).toBe(3)
    expect(pickCard([], null)).toBeNull()
  })

  it('moves on to the card after one that was decided', () => {
    const before = { ids: [3, 5, 8], shown: 5 }
    expect(pickCard([3, 8], 5, before)).toBe(8)
    // the last one decided: the one before it
    expect(pickCard([3, 5], 8, { ids: [3, 5, 8], shown: 8 })).toBe(5)
    // the queue emptied
    expect(pickCard([], 5, before)).toBeNull()
    // the live list answers again with the same cards: the card moved on to stays
    expect(pickCard([3, 8], 5, { ids: [3, 8], shown: 8 })).toBe(8)
  })

  it('keeps the card shown when none is asked for', () => {
    expect(pickCard([3, 5, 8], null, { ids: [3, 5, 8], shown: 8 })).toBe(8)
  })
})

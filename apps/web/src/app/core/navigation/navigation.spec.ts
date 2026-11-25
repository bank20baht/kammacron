import { NAV, currentKey } from './navigation'

describe('currentKey', () => {
  const keys = ['', 'orders', 'orders/archive', 'order']

  it('is the entry the URL sits under', () => {
    expect(currentKey('/orders', keys)).toBe('orders')
    expect(currentKey('/orders/42?tab=lines#top', keys)).toBe('orders')
    expect(currentKey('/order/1', keys)).toBe('order')
  })

  it('prefers the longest entry', () => {
    expect(currentKey('/orders/archive/2024', keys)).toBe('orders/archive')
  })

  it('is Home for the root and for a URL no entry owns', () => {
    expect(currentKey('/', keys)).toBe('')
    expect(currentKey('/ordersx', keys)).toBe('')
  })
})

describe('NAV', () => {
  it('is the four pages of the spec, the calendar and stats, each at its own path', () => {
    expect(NAV.map((item) => item.key)).toEqual([
      'board',
      'review',
      'runs',
      'calendar',
      'stats',
      'settings',
    ])
    for (const item of NAV) expect(item.href).toBe(`/${item.key}`)
  })
})

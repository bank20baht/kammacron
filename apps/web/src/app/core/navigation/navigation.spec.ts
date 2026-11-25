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
  it('starts with Home at the root', () => {
    expect(NAV[0]).toEqual({ key: '', label: 'Home', href: '/' })
  })
})

import { t } from '../i18n/i18n.service'
import { NAV, currentKey, navWith } from './navigation'

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
  it('is every page, each at its own path, the cron jobs page among them', () => {
    expect(NAV(t).map((item) => item.key)).toEqual([
      'board',
      'review',
      'cron',
      'runs',
      'calendar',
      'stats',
      'settings',
    ])
    for (const item of NAV(t)) expect(item.href).toBe(`/${item.key}`)
  })

  it('groups the pages by what they are about', () => {
    const groups = Object.fromEntries(NAV(t).map((item) => [item.key, item.group]))
    expect(groups).toEqual({
      board: 'Kanban',
      review: 'Kanban',
      cron: 'Cron',
      runs: 'Cron',
      calendar: 'Cron',
      stats: 'System',
      settings: 'System',
    })
  })
})

describe('navWith', () => {
  it('puts the projects between the cron pages and System, and counts the reviews', () => {
    const items = navWith(t, 2, [{ slug: 'shop', name: 'Baan Kanom' }])
    expect(items.map((item) => item.key)).toEqual([
      'board',
      'review',
      'cron',
      'runs',
      'calendar',
      'board/shop',
      'stats',
      'settings',
    ])
    expect(items.find((item) => item.key === 'review')?.badge).toBe(2)
    expect(items.find((item) => item.key === 'board/shop')?.group).toBe('Projects')
  })
})

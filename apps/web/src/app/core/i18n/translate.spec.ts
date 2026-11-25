import { en } from './en'
import { t } from './i18n.service'
import { translate } from './translate'

describe('translate', () => {
  const catalog = {
    a: { hello: 'Hello, {name}', cards: { one: '{count} card', other: '{count} cards' } },
  }

  it('fills params, picks the plural form, and shows a missing key as itself', () => {
    expect(translate(catalog, 'en', 'a.hello', { name: 'Ann' })).toBe('Hello, Ann')
    expect(translate(catalog, 'en', 'a.cards', { count: 1 })).toBe('1 card')
    expect(translate(catalog, 'en', 'a.cards', { count: 3 })).toBe('3 cards')
    expect(translate(catalog, 'en', 'a.nope')).toBe('a.nope')
    expect(translate(catalog, 'en', 'a.hello')).toBe('Hello, {name}')
  })

  it('the app catalog answers through t', () => {
    expect(t('nav.board')).toBe(en.nav.board)
  })
})

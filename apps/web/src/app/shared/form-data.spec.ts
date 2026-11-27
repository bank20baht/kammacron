import { countOf, filled, trimmed } from './form-data'

describe("a form's values, as the API takes them", () => {
  it('trims text, and says an empty one as the caller needs it', () => {
    expect(trimmed('  a b ')).toBe('a b')
    expect(trimmed(null)).toBe('')
    expect(filled('  x ')).toBe('x')
    expect(filled('   ')).toBeNull()
    expect(filled(undefined)).toBeNull()
  })

  it('takes a count as a whole number above zero, else the fallback', () => {
    expect(countOf(4.6, 30)).toBe(5)
    expect(countOf(0, 30)).toBe(30)
    expect(countOf(null, 30)).toBe(30)
    expect(countOf(-2, undefined)).toBeUndefined()
  })
})

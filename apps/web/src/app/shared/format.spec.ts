import { ago, cost, duration, stamp } from './format'

describe('format', () => {
  const now = new Date('2026-11-25T10:00:00Z').getTime()

  it('ago: past and future, in the largest unit that fits', () => {
    expect(ago(new Date(now - 30_000), now)).toContain('30')
    expect(ago(new Date(now - 3 * 60_000), now)).toContain('3')
    expect(ago(new Date(now + 2 * 60 * 60_000), now)).toContain('2')
    expect(ago(null, now)).toBe('—')
  })

  it('duration: seconds, minutes, hours', () => {
    const start = new Date('2026-11-25T10:00:00Z')
    expect(duration(start, new Date('2026-11-25T10:00:42Z'))).toBe('42s')
    expect(duration(start, new Date('2026-11-25T10:04:05Z'))).toBe('4m 05s')
    expect(duration(start, new Date('2026-11-25T11:03:00Z'))).toBe('1h 03m')
  })

  it('cost and stamp', () => {
    expect(cost(null)).toBe('—')
    expect(cost(0.42)).toContain('0.42')
    expect(stamp(null)).toBe('—')
    expect(stamp('2026-11-25T10:00:00')).toBe('2026-11-25 10:00')
  })
})

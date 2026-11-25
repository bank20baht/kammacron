import { daysWith, every, occurrences } from './cron'

const at = (s: string) => new Date(s)

describe('cron', () => {
  const now = at('2026-11-25T10:00:00Z')

  it('steps from the next time, inside the range only', () => {
    const job = { every_minutes: 60, next_at: '2026-11-25T10:30:00Z', off: null }
    const times = occurrences(job, at('2026-11-25T00:00:00Z'), at('2026-11-25T13:00:00Z'), now)
    expect(times.map((d) => d.toISOString().slice(11, 16))).toEqual(['10:30', '11:30', '12:30'])
  })

  it('a range further ahead starts on the job’s own beat', () => {
    const job = { every_minutes: 60, next_at: '2026-11-25T10:30:00Z', off: null }
    const times = occurrences(job, at('2026-11-26T00:00:00Z'), at('2026-11-26T02:00:00Z'), now)
    expect(times.map((d) => d.toISOString().slice(11, 16))).toEqual(['00:30', '01:30'])
  })

  it('a past next time counts from now; an off job never runs; the cap holds', () => {
    const late = { every_minutes: 30, next_at: '2026-11-24T00:00:00Z', off: null }
    expect(occurrences(late, at('2026-11-20T00:00:00Z'), at('2026-11-25T11:00:00Z'), now)).toEqual([
      at('2026-11-25T10:00:00Z'),
      at('2026-11-25T10:30:00Z'),
    ])
    expect(
      occurrences({ ...late, off: 'worker off' }, now, at('2026-12-01T00:00:00Z'), now),
    ).toEqual([])
    expect(occurrences(late, now, at('2027-01-01T00:00:00Z'), now, 5)).toHaveLength(5)
  })

  it('days and intervals in words', () => {
    expect(
      daysWith([at('2026-11-25T10:00:00'), at('2026-11-25T11:00:00'), at('2026-11-26T01:00:00')]),
    ).toEqual(['2026-11-25', '2026-11-26'])
    expect([30, 60, 360, 1440, 4320].map(every)).toEqual([
      'every 30 min',
      'hourly',
      'every 6 h',
      'daily',
      'every 3 days',
    ])
  })
})

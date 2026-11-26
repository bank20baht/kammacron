import { cronOf, runsWhat } from './schedule'

describe('schedule', () => {
  it('turns each preset into cron', () => {
    expect(cronOf('interval', {})).toBeNull()
    expect(cronOf('hourly', { minute: 15 })).toBe('15 * * * *')
    expect(cronOf('hourly', {})).toBe('0 * * * *')
    expect(cronOf('daily', { time: '09:30' })).toBe('30 9 * * *')
    expect(cronOf('weekdays', { time: '18:05' })).toBe('5 18 * * 1-5')
    expect(cronOf('weekly', { time: '07:00', weekday: '1' })).toBe('0 7 * * 1')
    expect(cronOf('cron', { cron: '  */10   * * * * ' })).toBe('*/10 * * * *')
  })

  it('is null while a field it needs is missing or wrong', () => {
    expect(cronOf('daily', {})).toBeNull()
    expect(cronOf('daily', { time: '25:00' })).toBeNull()
    expect(cronOf('weekly', { time: '07:00' })).toBeNull()
    expect(cronOf('hourly', { minute: 60 })).toBeNull()
    expect(cronOf('cron', { cron: '' })).toBeNull()
  })

  it('says what a schedule runs in one line', () => {
    const base = { command: null, playbook: null, agent: null, prompt: null }
    expect(runsWhat({ ...base, command: 'bun test' })).toBe('bun test')
    expect(runsWhat({ ...base, playbook: 'deploy' })).toBe('playbook:deploy')
    expect(runsWhat({ ...base, agent: 'codex', prompt: 'Take one card\nthen more' })).toBe(
      'codex: Take one card',
    )
  })
})

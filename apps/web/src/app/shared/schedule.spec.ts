import { t } from '../core/i18n/i18n.service'
import {
  cronOfPick,
  cronProblem,
  cronSummary,
  DEFAULT_CRON,
  partValid,
  pickOf,
  pickProblem,
  pickSummary,
  runsWhat,
  type SchedulePick,
} from './schedule'

const date = (days: number[], time = '09:00'): SchedulePick => ({
  ...pickOf(undefined),
  mode: 'date',
  time,
  days,
})

describe('schedule', () => {
  it('turns days and a time into cron, as an alarm clock is set', () => {
    expect(cronOfPick(date([2, 4]))).toBe('0 9 * * 2,4')
    expect(cronOfPick(date([4, 2], '07:30'))).toBe('30 7 * * 2,4')
    expect(cronOfPick(date([1, 2, 3, 4, 5]))).toBe('0 9 * * 1-5')
    expect(cronOfPick(date([0, 1, 2, 3, 4, 5, 6], '18:05'))).toBe('5 18 * * *')
    expect(cronOfPick(date([]))).toBeNull()
  })

  it('every few minutes, every hour, or the five fields typed in', () => {
    const base = pickOf(undefined)
    expect(cronOfPick({ ...base, mode: 'interval', every: 15 })).toBe('*/15 * * * *')
    expect(cronOfPick({ ...base, mode: 'interval', every: 7 })).toBeNull()
    expect(cronOfPick({ ...base, mode: 'hourly', minute: 5 })).toBe('5 * * * *')
    expect(cronOfPick({ ...base, mode: 'cron', parts: ['*', '*', '*', '*', '*'] })).toBe(
      '* * * * *',
    )
    expect(cronOfPick({ ...base, mode: 'cron', parts: ['0', '25', '*', '*', '*'] })).toBeNull()
  })

  it('reads a cron string back into the picker, the mode that says it or the five boxes', () => {
    expect(pickOf('30 7 * * 2,4')).toMatchObject({ mode: 'date', time: '07:30', days: [2, 4] })
    expect(pickOf('0 9 * * 1-5')).toMatchObject({ mode: 'date', days: [1, 2, 3, 4, 5] })
    expect(pickOf('0 9 * * 7')).toMatchObject({ mode: 'date', days: [0] })
    expect(pickOf('*/10 * * * *')).toMatchObject({ mode: 'interval', every: 10 })
    expect(pickOf('15 * * * *')).toMatchObject({ mode: 'hourly', minute: 15 })
    expect(pickOf('0 0 1 * *')).toMatchObject({ mode: 'cron', parts: ['0', '0', '1', '*', '*'] })
    expect(pickOf('@daily')).toMatchObject({ mode: 'date', time: '00:00' })
    expect(pickOf('*/7 * * * *').mode).toBe('cron')
    // what the picker makes, it reads back the same
    for (const cron of ['30 7 * * 2,4', '*/15 * * * *', '5 * * * *', '0 9 * * *'])
      expect(cronOfPick(pickOf(cron))).toBe(cron)
  })

  it('checks each box against its field: numbers in range, *, lists, ranges and steps', () => {
    expect(partValid('*/15', 0)).toBe(true)
    expect(partValid('1-5', 4)).toBe(true)
    expect(partValid('2,4', 4)).toBe(true)
    expect(partValid('60', 0)).toBe(false)
    expect(partValid('0', 2)).toBe(false)
    expect(partValid('*/0', 0)).toBe(false)
    expect(cronProblem('30 7 * * 2,4')).toBeNull()
    expect(cronProblem('@weekly')).toBeNull()
    expect(cronProblem('* * *')).toBe('cron')
    expect(cronProblem(null)).toBe('cron')
  })

  it('says what is missing, then reads it back in a sentence', () => {
    expect(pickProblem(date([]))).toBe('noDay')
    expect(pickProblem(date([1], '25:00'))).toBe('time')
    expect(pickSummary(t, date([2, 4]))).toBe('Runs on Tue and Thu at 09:00')
    expect(pickSummary(t, date([1]))).toBe('Runs on Mondays at 09:00')
    expect(pickSummary(t, date([1, 3, 5]))).toBe('Runs on Mon, Wed and Fri at 09:00')
    expect(cronSummary(t, '0 9 * * 1-5')).toBe('Runs on weekdays at 09:00')
    expect(cronSummary(t, '0 9 * * *')).toBe('Runs every day at 09:00')
    expect(cronSummary(t, '*/15 * * * *')).toBe('Runs every 15 minutes')
    expect(pickOf(DEFAULT_CRON).mode).toBe('date')
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

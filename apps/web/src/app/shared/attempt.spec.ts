import { signal } from '@angular/core'

import { attempt, attemptWithNotice, type Notice } from './attempt'

describe('a request behind a button', () => {
  it('is busy while it goes and hands back its answer', async () => {
    const busy = signal(false)
    const seen: boolean[] = []
    const done = await attempt(
      busy,
      () => undefined,
      () => {
        seen.push(busy())
        return Promise.resolve(undefined)
      },
    )
    expect(seen).toEqual([true])
    expect(done).toEqual({ value: undefined })
    expect(busy()).toBe(false)
  })

  it('says why it failed, and is no longer busy', async () => {
    const busy = signal(false)
    const said: string[] = []
    const done = await attempt(
      busy,
      (message) => said.push(message),
      () => Promise.reject(new Error('no such card')),
    )
    expect(done).toBeNull()
    expect(said).toHaveLength(1)
    expect(busy()).toBe(false)
  })

  it('leaves one notice: saved, or the error in place of the last notice', async () => {
    const busy = signal(false)
    const notice = signal<Notice | null>({ tone: 'danger', text: 'old' })
    expect(await attemptWithNotice(busy, notice, () => Promise.resolve('Saved'))).toBe(true)
    expect(notice()).toEqual({ tone: 'success', text: 'Saved' })
    expect(await attemptWithNotice(busy, notice, () => Promise.reject(new Error('x')))).toBe(false)
    expect(notice()?.tone).toBe('danger')
  })
})

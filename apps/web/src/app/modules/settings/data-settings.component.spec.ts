import { TestBed } from '@angular/core/testing'
import { dialog } from '@20baht/ui/overlay'
import { Api } from '@kammacron/kit'
import { of, throwError } from 'rxjs'

import { DataSettingsComponent } from './data-settings.component'

const KEYS = [
  'run_log_retention_days',
  'step_output_retention_days',
  'run_retention_days',
  'done_card_archive_days',
  'archived_card_retention_days',
  'alert_retention_days',
] as const
const retention = Object.fromEntries(KEYS.map((k) => [k, 7])) as Record<string, number | null>
const kinds = (due: number) => KEYS.map((key) => ({ key, total: 10, due, bytes: null }))

/** A fake server: what was asked of it, and what it answers. */
const server = (saveFails = false) => {
  const calls: { clean: number; patches: unknown[]; queries: unknown[] } = {
    clean: 0,
    patches: [],
    queries: [],
  }
  const api = {
    data: {
      get: ({ query }: { query: Record<string, string> }) => {
        calls.queries.push(query)
        // a preview with every length "never" lets nothing go; the saved 7 days let 3 go
        const never = Object.values(query).every((v) => v === 'never') && Object.keys(query).length
        return of({ retention, kinds: kinds(never ? 0 : 3) })
      },
      clean: {
        post: () => {
          calls.clean++
          return of(Object.fromEntries(KEYS.map((k) => [k, 3])))
        },
      },
    },
    settings: {
      patch: (patch: unknown) => {
        calls.patches.push(patch)
        return saveFails ? throwError(() => new Error('down')) : of({})
      },
    },
  }
  return { api, calls }
}

/** The page, without its template: what it does, not how it draws. */
const page = async (saveFails = false) => {
  const { api, calls } = server(saveFails)
  TestBed.configureTestingModule({
    providers: [{ provide: Api, useValue: { client: { api } } }],
  })
  TestBed.overrideComponent(DataSettingsComponent, { set: { template: '' } })
  const component = TestBed.createComponent(DataSettingsComponent).componentInstance as unknown as {
    changed(data: Record<string, unknown>): void
    save(): Promise<void>
    discard(): void
    clean(): Promise<void>
    dirty(): boolean
  }
  await new Promise((r) => setTimeout(r))
  return { component, calls }
}

const allNever = Object.fromEntries(KEYS.map((k) => [k, 'never']))

describe('Settings → Data: Clean now', () => {
  afterEach(() => vi.restoreAllMocks())

  it('will not clean while a changed length is unsaved', async () => {
    const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
    const { component, calls } = await page()
    component.changed(allNever)
    expect(component.dirty()).toBe(true)
    await component.clean()
    expect(confirm).not.toHaveBeenCalled()
    expect(calls.clean).toBe(0)
  })

  it('asks first with what the saved lengths let go, and a No sends nothing', async () => {
    const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(false)
    const { component, calls } = await page()
    await component.clean()
    expect(confirm).toHaveBeenCalledOnce()
    const [, options] = confirm.mock.calls[0] ?? []
    // removed apart from archived
    expect(options?.detail).toContain('Removed for good:')
    expect(options?.detail).toContain('Archived (can be brought back):')
    // the summary asked for is the saved one: no lengths in the query
    expect(calls.queries.at(-1)).toEqual({})
    expect(calls.clean).toBe(0)
  })

  it('cleans after a Yes, and after a save by the lengths just saved', async () => {
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
    const { component, calls } = await page()
    component.changed(allNever)
    await component.save()
    expect(calls.patches).toHaveLength(1)
    expect(component.dirty()).toBe(false)
    await component.clean()
    expect(calls.clean).toBe(1)
  })

  it('stays shut when the save fails, and opens again on Discard', async () => {
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
    const { component, calls } = await page(true)
    component.changed(allNever)
    await component.save()
    expect(component.dirty()).toBe(true)
    await component.clean()
    expect(calls.clean).toBe(0)
    component.discard()
    expect(component.dirty()).toBe(false)
    await component.clean()
    expect(calls.clean).toBe(1)
  })
})

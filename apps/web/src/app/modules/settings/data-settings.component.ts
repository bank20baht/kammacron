import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import type { FormDefinition } from '@20baht/ui'
import { defineForm } from '@20baht/ui/engine'
import { dialog } from '@20baht/ui/overlay'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n, type Translate } from '../../core/i18n/i18n.service'

const KEYS = [
  'run_log_retention_days',
  'step_output_retention_days',
  'run_retention_days',
  'done_card_archive_days',
  'archived_card_retention_days',
  'alert_retention_days',
] as const
type Key = (typeof KEYS)[number]
type Retention = Record<Key, number | null>
type Kind = { key: Key; total: number; due: number; bytes: number | null }
/** The kinds that are archived, not removed, when their length has passed. */
const ARCHIVES: ReadonlySet<Key> = new Set(['done_card_archive_days'])

/** The lengths offered: days, or never. */
const LENGTHS = ['7', '14', '30', '90', '180', '365', 'never'] as const
const NEVER = 'never'

const toChoice = (days: number | null) => (days === null ? NEVER : String(days))
const toDays = (v: unknown) => (v === NEVER || typeof v !== 'string' ? null : Number(v))

/** 38 MB, 412 KB. */
const size = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit++
  }
  return `${n >= 10 || unit === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[unit] ?? 'B'}`
}

/** One dropdown a kind: its length, what it is, how much there is, and what would go now. */
const dataForm = (t: Translate, kinds: readonly Kind[]): FormDefinition =>
  defineForm({
    form_id: 'data',
    form_name: t('settings.data.heading'),
    fields: KEYS.map((key, i) => {
      const kind = kinds.find((k) => k.key === key)
      const now = kind
        ? kind.bytes !== null
          ? t('settings.data.size', { n: kind.total, size: size(kind.bytes) })
          : t('settings.data.count', { n: kind.total })
        : ''
      const due = kind?.due ? t('settings.data.due', { n: kind.due }) : ''
      return {
        order: i + 1,
        type: 'dropdown' as const,
        key,
        label: t(`settings.data.kinds.${key}.label`),
        help: [t(`settings.data.kinds.${key}.help`), now, due].filter(Boolean).join(' · '),
        width: '1/2' as const,
        options: LENGTHS.map((l) => ({
          key: l,
          label:
            l === NEVER
              ? t('settings.data.never')
              : l === '365'
                ? t('settings.data.year')
                : t('settings.data.days', { n: l }),
        })),
      }
    }),
  })

/**
 * Settings → Data: how long each kind of kept data stays, how much there is, what a length would
 * let go before it is saved, and Clean now.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-data-settings',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--baht-space-2);
      margin-top: var(--baht-space-3);
    }
    .hint {
      margin: var(--baht-space-2) 0 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    @if (message(); as m) {
      <baht-alert
        [tone]="m.tone"
        [message]="m.text"
        dismissible
        (bahtDismiss)="message.set(null)"
      ></baht-alert>
    }
    <baht-card [heading]="t('settings.data.heading')" [subtitle]="t('settings.data.description')">
      @if (kinds().length) {
        <baht-form
          [form]="form()"
          [value]="value()"
          (bahtChange)="changed($any($event).data)"
        ></baht-form>
        <div class="row">
          <baht-button variant="primary" [disabled]="busy() || !dirty()" (click)="save()">{{
            t('settings.data.save')
          }}</baht-button>
          @if (dirty()) {
            <baht-button variant="ghost" [disabled]="busy()" (click)="discard()">{{
              t('settings.data.discard')
            }}</baht-button>
          }
          <baht-button
            variant="secondary"
            [disabled]="busy() || dirty()"
            [attr.aria-describedby]="dirty() ? 'data-unsaved' : null"
            (click)="clean()"
            >{{ t('settings.data.clean') }}</baht-button
          >
        </div>
        @if (dirty()) {
          <p id="data-unsaved" class="hint">{{ t('settings.data.unsaved') }}</p>
        }
      } @else {
        <baht-skeleton variant="text"></baht-skeleton>
      }
    </baht-card>
  `,
})
export class DataSettingsComponent {
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t
  protected readonly busy = signal(false)
  protected readonly message = signal<{ tone: 'success' | 'danger'; text: string } | null>(null)
  /** What each kind holds, as the chosen (maybe unsaved) lengths would leave it. */
  protected readonly kinds = signal<readonly Kind[]>([])
  /** The lengths as saved: what the form starts from. */
  private readonly saved = signal<Retention | null>(null)
  /** The lengths chosen now, before they are saved. */
  private readonly chosen = signal<Record<Key, string> | null>(null)

  protected readonly form = computed(() => dataForm(this.t, this.kinds()))
  /** A length is chosen that is not the saved one. */
  protected readonly dirty = computed(() => {
    const chosen = this.chosen()
    const saved = this.saved()
    if (!chosen) return false
    return !saved || KEYS.some((k) => chosen[k] !== toChoice(saved[k]))
  })
  /** The chosen lengths, else the saved: the form shows them again when its help text changes. */
  protected readonly value = computed(() => {
    const chosen = this.chosen()
    if (chosen) return chosen
    const r = this.saved()
    return r ? Object.fromEntries(KEYS.map((k) => [k, toChoice(r[k])])) : {}
  })

  constructor() {
    void this.read()
  }

  /** What is kept; with `choice`, as those lengths would leave it. */
  private async read(choice?: Record<Key, string>): Promise<void> {
    try {
      const summary = await firstValueFrom(this.api.data.get({ query: choice ?? {} }))
      if (!choice) this.saved.set(summary.retention)
      this.kinds.set(summary.kinds)
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    }
  }

  protected changed(data: Record<string, unknown>): void {
    const choice = Object.fromEntries(
      KEYS.map((k) => [k, typeof data[k] === 'string' ? data[k] : NEVER]),
    ) as Record<Key, string>
    if (JSON.stringify(choice) === JSON.stringify(this.value())) return
    this.chosen.set(choice)
    void this.read(choice)
  }

  protected async save(): Promise<void> {
    const chosen = this.chosen()
    if (!chosen || !this.dirty()) return
    const patch = Object.fromEntries(KEYS.map((k) => [k, toDays(chosen[k])])) as Retention
    await this.act(async () => {
      // a failed save keeps `chosen`, so Clean now stays shut until it is saved or discarded
      await firstValueFrom(this.api.settings.patch(patch))
      this.saved.set(patch)
      this.chosen.set(null)
      await this.read()
      return this.t('settings.messages.saved')
    })
  }

  /** Back to the saved lengths, and what they hold. */
  protected discard(): void {
    this.chosen.set(null)
    this.message.set(null)
    void this.read()
  }

  /**
   * Clean now goes by the saved lengths (the server reads them), so it is shut while a change is
   * unsaved, and it asks first with what those saved lengths let go: removed apart from archived.
   */
  protected async clean(): Promise<void> {
    if (this.dirty()) return
    this.busy.set(true)
    this.message.set(null)
    let sure = false
    try {
      // fresh, and from the saved lengths: a preview still on its way must not be what is shown
      const { kinds } = await firstValueFrom(this.api.data.get({ query: {} }))
      this.kinds.set(kinds)
      const detail = this.dueList(kinds)
      sure = await dialog.confirm(this.confirmText(kinds), {
        title: this.t('settings.data.confirmTitle'),
        tone: 'warning',
        confirmText: this.t('settings.data.clean'),
        ...(detail ? { detail } : {}),
      })
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
    if (!sure) return
    await this.act(async () => {
      const done = (await firstValueFrom(this.api.data.clean.post())) as Record<Key, number>
      await this.read()
      const list = KEYS.filter((k) => done[k] > 0)
        .map((k) => `${this.t(`settings.data.kinds.${k}.label`)} ${String(done[k])}`)
        .join(', ')
      return list ? this.t('settings.data.cleaned', { list }) : this.t('settings.data.nothing')
    })
  }

  private confirmText(kinds: readonly Kind[]): string {
    return kinds.some((k) => k.due > 0)
      ? this.t('settings.data.confirmMessage')
      : this.t('settings.data.confirmNothing')
  }

  /** "Removed for good: Run logs 12, Runs 3" and "Archived: …", a line each, empty when nothing. */
  private dueList(kinds: readonly Kind[]): string {
    const line = (heading: string, keys: readonly Key[]) => {
      const items = keys
        .map((key) => ({ key, due: kinds.find((k) => k.key === key)?.due ?? 0 }))
        .filter((k) => k.due > 0)
        .map((k) => `  ${this.t(`settings.data.kinds.${k.key}.label`)}: ${String(k.due)}`)
      return items.length ? [heading, ...items].join('\n') : ''
    }
    return [
      line(
        this.t('settings.data.willRemove'),
        KEYS.filter((k) => !ARCHIVES.has(k)),
      ),
      line(this.t('settings.data.willArchive'), [...ARCHIVES]),
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  private async act(work: () => Promise<string>): Promise<void> {
    this.busy.set(true)
    this.message.set(null)
    try {
      this.message.set({ tone: 'success', text: await work() })
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }
}

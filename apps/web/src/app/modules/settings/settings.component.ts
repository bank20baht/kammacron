import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { BahtForm, ColumnMap, TabItem } from '@20baht/ui'
import { defineForm } from '@20baht/ui/engine'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import { I18n, type AppLocale, type Translate } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { accessForm, workerForm } from '../../shared/forms'
import { attemptWithNotice, type Notice } from '../../shared/attempt'
import { dataOf, filled, trimmed } from '../../shared/form-data'
import { DataSettingsComponent } from './data-settings.component'
import { ProjectWizardComponent } from './project-wizard.component'

const projectColumns = (t: Translate): ColumnMap => ({
  name: t('settings.projects.columns.name'),
  slug: { label: t('settings.projects.columns.slug'), cell: 'code' },
  worker: {
    label: t('settings.projects.columns.worker'),
    cell: 'badge',
    // by the row's state, not its words: the words change with the locale
    tone: (_value, row) =>
      row['state'] === 'paused' ? 'warning' : row['state'] === 'board' ? 'neutral' : 'success',
  },
  checked: t('settings.projects.columns.checked'),
})

const TABS = ['projects', 'mcp', 'worker', 'access', 'data', 'machine'] as const

/** The language of this browser's pages: one option per locale the app speaks. */
const languageForm = (t: Translate, locales: readonly AppLocale[]) =>
  defineForm({
    form_id: 'language',
    form_name: t('settings.language.form'),
    fields: [
      {
        order: 1,
        type: 'dropdown',
        key: 'locale',
        label: t('settings.language.label'),
        options: locales.map((key) => ({ key, label: t(`settings.languages.${key}`) })),
      },
    ],
  })

/** The install: MCP, pause, hosts, notifications, the tools found; and the projects. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IllustrationComponent, BAHT_UI, DataSettingsComponent, ProjectWizardComponent],
  selector: 'web-settings',
  styleUrl: './settings.component.css',
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private readonly api = inject(Api).client.api
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)

  protected readonly settings = resource({ loader: () => firstValueFrom(this.api.settings.get()) })
  protected readonly system = resource({ loader: () => firstValueFrom(this.api.system.get()) })
  protected readonly token = resource({ loader: () => firstValueFrom(this.api.token.get()) })
  protected readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )

  protected readonly message = signal<Notice | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly i18n = inject(I18n)
  protected readonly t = this.i18n.t
  protected readonly tabs = computed<TabItem[]>(() =>
    TABS.map((key) => ({ key, label: this.t(`settings.tabs.${key}`) })),
  )
  protected readonly tab = signal('projects')
  protected readonly projectColumns = computed(() => projectColumns(this.t))
  protected readonly projectRows = computed(() =>
    (this.projects().data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      state: p.paused_reason ? 'paused' : p.worker_enabled && p.repo_path ? 'on' : 'board',
      worker: p.paused_reason
        ? this.t('settings.projects.paused')
        : p.worker_enabled && p.repo_path
          ? this.t('settings.projects.every', { minutes: p.interval_minutes })
          : this.t('settings.projects.boardOnly'),
      checked: p.last_checked_at ? ago(p.last_checked_at) : this.t('settings.projects.notYet'),
    })),
  )
  protected readonly forms = computed(() => ({
    worker: workerForm(this.t),
    access: accessForm(this.t),
    language: languageForm(this.t, this.i18n.locales),
  }))
  protected readonly languageValue = computed(() => ({ locale: this.i18n.locale() }))

  protected readonly workerValue = computed(() => {
    const s = this.settings.value()
    return s
      ? {
          stale_minutes: s.stale_minutes,
          concurrency: s.concurrency,
          worker_path: s.worker_path ?? '',
        }
      : {}
  })
  protected readonly accessValue = computed(() => {
    const s = this.settings.value()
    return s
      ? {
          allowed_hosts: s.allowed_hosts,
          webhook_url: s.webhook_url ?? '',
          desktop_notifications: s.desktop_notifications,
          public_url: s.public_url ?? '',
        }
      : {}
  })

  protected readonly mcpCommand = computed(() => {
    const token = this.token.value()?.token ?? '…'
    return `claude mcp add --transport http kammacron ${globalThis.location.origin}/mcp --header "Authorization: Bearer ${token}"`
  })

  private async act(work: () => Promise<unknown>, done: string): Promise<void> {
    const went = await attemptWithNotice(this.busy, this.message, async () => {
      await work()
      return done
    })
    if (went) this.settings.reload()
  }

  protected save(patch: Parameters<typeof this.api.settings.patch>[0]): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.settings.patch(patch)),
      this.t('settings.messages.saved'),
    )
  }

  protected saveWorker(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = dataOf(this.forms().worker, form)
    return this.save({
      stale_minutes: Math.round(d.stale_minutes ?? Number.NaN),
      concurrency: Math.round(d.concurrency ?? Number.NaN),
      worker_path: filled(d.worker_path),
    })
  }

  protected saveAccess(form: BahtForm): Promise<void> {
    const d = dataOf(this.forms().access, form)
    return this.save({
      allowed_hosts: d.allowed_hosts,
      webhook_url: filled(d.webhook_url),
      desktop_notifications: d.desktop_notifications,
      public_url: trimmed(d.public_url).replace(/\/+$/, '') || null,
    })
  }

  protected rotate(): Promise<void> {
    return this.act(async () => {
      await firstValueFrom(this.api.token.rotate.post())
      this.token.reload()
    }, this.t('settings.messages.rotated'))
  }

  /** The new-project wizard is open. */
  protected readonly addingProject = signal(false)

  protected setLocale(value: unknown): void {
    const next = this.i18n.locales.find((l) => l === value)
    if (next) this.i18n.setLocale(next)
  }

  /** `id` is the row's own, which the table hands back untyped: the project's number. */
  protected openProject(id: unknown): void {
    if (typeof id === 'number') void this.router.navigate(['/settings/projects', id])
  }
}

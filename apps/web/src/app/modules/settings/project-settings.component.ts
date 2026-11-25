import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { BahtForm, Crumb, TabItem } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { COMMAND, projectForm, scheduleForm } from '../../shared/forms'
import { PlaybookEditorComponent } from './playbook-editor.component'

type Check = {
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
}

const SECTIONS = ['general', 'playbook', 'worker', 'permissions', 'schedules', 'advanced'] as const

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const count = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])

/** One project's settings, its playbook, the directory check, Run now, and its schedules. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, PlaybookEditorComponent],
  selector: 'web-project-settings',
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-block: var(--baht-space-2);
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-block: var(--baht-space-3);
    }
    .muted {
      color: var(--baht-color-text-muted);
    }
  `,
  templateUrl: './project-settings.component.html',
})
export class ProjectSettingsComponent {
  private readonly api = inject(Api).client.api
  private readonly live = inject(LiveService).live
  readonly id = input.required<string>()
  /** `?section=permissions` opens that section (the run page links there). */
  readonly section = input<string>()
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  protected readonly sections = computed<TabItem[]>(() =>
    SECTIONS.map((key) => ({ key, label: this.t(`project.sections.${key}`) })),
  )
  protected readonly picked = signal<string | null>(null)
  protected readonly current = computed(() => this.picked() ?? this.section() ?? 'general')
  protected readonly dirty = signal(false)
  protected readonly crumbs = computed<Crumb[]>(() => [
    { label: this.t('nav.settings') },
    { label: this.project.value()?.name ?? '…' },
  ])

  protected readonly project = resource({
    params: () => this.id(),
    loader: ({ params }) => firstValueFrom(this.api.projects({ id: params }).get()),
  })
  protected readonly schedules = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects/:id/schedules', { params: { id: this.id() } }),
  )
  protected readonly check = signal<Check | null>(null)
  protected readonly message = signal<{ tone: 'success' | 'danger'; text: string } | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly projectForm = computed(() => projectForm(this.t))
  protected readonly scheduleForm = computed(() =>
    scheduleForm(
      this.t,
      (this.project.value()?.playbooks ?? []).map((p) => p.name),
    ),
  )
  protected readonly scheduleValue = { interval_minutes: 1440, runs: COMMAND }

  protected readonly value = computed(() => {
    const p = this.project.value()
    if (!p) return {}
    return {
      ...p,
      repo_path: p.repo_path ?? '',
      model: p.model ?? '',
    }
  })

  private async act(work: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true)
    this.message.set(null)
    try {
      await work()
      this.message.set({ tone: 'success', text: done })
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }

  protected due(at: string | Date): boolean {
    return new Date(at).getTime() <= Date.now()
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }

  protected discard(form: BahtForm): void {
    form.reset()
    this.dirty.set(false)
  }

  protected save(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    return this.act(async () => {
      await firstValueFrom(
        this.api.projects({ id: this.id() }).patch({
          name: text(d['name']) ?? '',
          repo_path: text(d['repo_path']),
          worker_enabled: d['worker_enabled'] === true,
          mode: d['mode'] === 'watch' ? 'watch' : 'autopilot',
          interval_minutes: count(d['interval_minutes'], 30),
          max_cards_per_run: count(d['max_cards_per_run'], 3),
          max_turns: count(d['max_turns'], 60),
          model: text(d['model']),
          allowed_bash: list(d['allowed_bash']),
          web_tools: d['web_tools'] === true,
          enabled_mcp_servers: list(d['enabled_mcp_servers']),
          extra_prompt: typeof d['extra_prompt'] === 'string' ? d['extra_prompt'] : '',
        }),
      )
      form.markClean()
      this.dirty.set(false)
      this.project.reload()
      if (text(d['repo_path'])) await this.runCheck()
    }, this.t('project.messages.saved'))
  }

  protected async runCheck(): Promise<void> {
    try {
      this.check.set(
        await firstValueFrom(this.api.projects({ id: this.id() })['check-repo'].post()),
      )
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    }
  }

  protected runNow(): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.projects({ id: this.id() })['run-now'].post()),
      this.t('project.messages.queued'),
    )
  }

  protected resume(): Promise<void> {
    return this.act(async () => {
      await firstValueFrom(this.api.projects({ id: this.id() }).resume.post())
      this.project.reload()
    }, this.t('project.messages.resumed'))
  }

  protected addSchedule(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    return this.act(async () => {
      await firstValueFrom(
        this.api.projects({ id: this.id() }).schedules.post({
          name: text(d['name']) ?? '',
          ...(text(d['runs']) && text(d['runs']) !== COMMAND
            ? { playbook: text(d['runs']) }
            : { command: text(d['command']) }),
          interval_minutes: count(d['interval_minutes'], 1440),
        }),
      )
      form.reset()
    }, this.t('project.messages.scheduleAdded'))
  }

  protected toggleSchedule(id: number, enabled: boolean): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.schedules({ id: String(id) }).patch({ enabled })),
      enabled ? this.t('project.messages.on') : this.t('project.messages.off'),
    )
  }
}

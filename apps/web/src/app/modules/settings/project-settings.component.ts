import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { dialog } from '@20baht/ui/overlay'
import type { BahtTabs, Crumb, TabItem } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import type { HasDraft } from '../../core/draft.guard'
import { I18n } from '../../core/i18n/i18n.service'
import { ago } from '../../shared/format'
import { projectForm } from '../../shared/forms'
import { attemptWithNotice, type Notice } from '../../shared/attempt'
import { countOf, filled, trimmed, type FormOf } from '../../shared/form-data'
import { CronJobsComponent } from '../cron/cron-jobs.component'
import { PlaybookEditorComponent } from './playbook-editor.component'

type Check = {
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
}

const SECTIONS = ['general', 'playbook', 'worker', 'permissions', 'schedules', 'advanced'] as const

/** One project's settings, its playbook, the directory check, Run now, and its schedules. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IllustrationComponent, BAHT_UI, PlaybookEditorComponent, CronJobsComponent],
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
    .grow {
      flex: 1;
    }
  `,
  templateUrl: './project-settings.component.html',
})
export class ProjectSettingsComponent implements HasDraft {
  private readonly api = inject(Api).client.api
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
  /** The playbook editor, there only while its tab is open: it keeps its own draft. */
  private readonly editor = viewChild(PlaybookEditorComponent)
  /** The question being asked, so a second click while it is open does not ask twice. */
  private asking: Promise<boolean> | null = null
  protected readonly crumbs = computed<Crumb[]>(() => [
    { label: this.t('nav.settings') },
    { label: this.project.value()?.name ?? '…' },
  ])

  protected readonly project = resource({
    params: () => this.id(),
    loader: ({ params }) => firstValueFrom(this.api.projects({ id: params }).get()),
  })
  protected readonly check = signal<Check | null>(null)
  protected readonly message = signal<Notice | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly projectForm = computed(() => projectForm(this.t))
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
    await attemptWithNotice(this.busy, this.message, async () => {
      await work()
      return done
    })
  }

  protected due(at: string | Date): boolean {
    return new Date(at).getTime() <= Date.now()
  }

  /** The draft guard's question: a draft (the project's or the playbook's) asks first. */
  canLeave(): boolean | Promise<boolean> {
    return this.dirty() || this.editor()?.dirty() ? this.askToDiscard() : true
  }

  /**
   * Another section. The project's form stays in the page across its sections, but the playbook
   * editor goes with its tab, so a playbook draft asks first; staying puts the tab back.
   */
  protected async pick(value: string, tabs: BahtTabs): Promise<void> {
    if (value === this.current()) return
    if (this.current() === 'playbook' && this.editor()?.dirty() && !(await this.askToDiscard())) {
      tabs.value = this.current()
      return
    }
    this.picked.set(value)
  }

  private askToDiscard(): Promise<boolean> {
    this.asking ??= dialog
      .confirm(this.t('project.leave.message'), {
        title: this.t('project.leave.title'),
        tone: 'warning',
        confirmText: this.t('project.leave.discard'),
        cancelText: this.t('project.leave.stay'),
      })
      .finally(() => (this.asking = null))
    return this.asking
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }

  protected discard(form: FormOf<typeof projectForm>): void {
    form.element.reset()
    this.dirty.set(false)
  }

  protected save(form: FormOf<typeof projectForm>): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    return this.act(async () => {
      await firstValueFrom(
        this.api.projects({ id: this.id() }).patch({
          name: trimmed(d.name),
          repo_path: filled(d.repo_path),
          worker_enabled: d.worker_enabled,
          mode: d.mode === 'watch' ? 'watch' : 'autopilot',
          interval_minutes: countOf(d.interval_minutes, 30),
          max_cards_per_run: countOf(d.max_cards_per_run, 3),
          max_turns: countOf(d.max_turns, 60),
          model: filled(d.model),
          allowed_bash: d.allowed_bash,
          web_tools: d.web_tools,
          enabled_mcp_servers: d.enabled_mcp_servers,
          extra_prompt: d.extra_prompt ?? '',
        }),
      )
      form.element.markClean()
      this.dirty.set(false)
      this.project.reload()
      if (filled(d.repo_path)) await this.runCheck()
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

  /** A person's to do: they type its name, then it goes with everything in it. */
  protected async remove(p: { id: number; name: string; slug: string }): Promise<void> {
    const typed = await dialog.prompt(this.t('project.danger.prompt', { name: p.name }), {
      tone: 'danger',
      title: this.t('project.danger.heading'),
      confirmText: this.t('project.danger.remove'),
      placeholder: p.name,
    })
    if (typed === null || (typed.trim() !== p.name && typed.trim() !== p.slug)) return
    this.busy.set(true)
    try {
      await firstValueFrom(
        this.api.projects({ id: String(p.id) }).delete({}, { query: { confirm: typed.trim() } }),
      )
      void this.router.navigate(['/settings'])
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }
}

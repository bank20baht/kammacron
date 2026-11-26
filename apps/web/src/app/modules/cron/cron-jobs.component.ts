import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { BahtForm } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { REGISTRY, scheduleForm } from '../../shared/forms'
import {
  cronProblem,
  DEFAULT_CRON,
  runsWhat,
  SCHEDULE_KINDS,
  type ScheduleKind,
} from '../../shared/schedule'

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])

/**
 * One project's cron jobs: the list (turn on or off, the last run) and the form that adds one,
 * what it runs picked with radio cards and when with the schedule picker. On the Cron jobs page, and in the project's settings.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-cron-jobs',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-4);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-block: var(--baht-space-2);
    }
    .muted {
      color: var(--baht-color-text-muted);
    }
    .grow {
      flex: 1;
    }
    /* room between the card's heading and the first field (Runs) */
    .add-form {
      display: block;
      margin-top: var(--baht-space-4);
    }
    .actions {
      justify-content: flex-end;
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
    <baht-card [heading]="t('cron.listHeading')">
      @for (s of schedules().data ?? []; track s.id) {
        <div class="row">
          <baht-badge
            [tone]="s.enabled ? 'success' : 'neutral'"
            [label]="s.enabled ? t('cron.on') : t('cron.off')"
          ></baht-badge>
          <strong>{{ s.name }}</strong>
          <baht-code [code]="runsWhat(s)"></baht-code>
          @if (s.agent && s.use_board) {
            <baht-badge tone="info" [label]="t('project.schedules.board')"></baht-badge>
          }
          <span class="muted">{{
            t('project.schedules.line', {
              when: whenOf(s),
              last: ago(s.last_run_at),
              result:
                s.last_result ??
                (s.last_exit_code === null ? t('common.none') : 'exit ' + s.last_exit_code),
            })
          }}</span>
          <span class="grow"></span>
          @if (s.last_run_id) {
            <baht-button size="sm" variant="ghost" (click)="go('/runs/' + s.last_run_id)">{{
              t('project.schedules.lastRun')
            }}</baht-button>
          }
          <baht-button size="sm" variant="ghost" (click)="toggle(s.id, !s.enabled)">{{
            s.enabled ? t('project.schedules.turnOff') : t('project.schedules.turnOn')
          }}</baht-button>
        </div>
      } @empty {
        <p class="muted">{{ t('project.schedules.empty') }}</p>
      }
    </baht-card>

    <baht-card [heading]="t('cron.addHeading')" [subtitle]="t('project.schedules.subtitle')">
      <baht-form
        #sf="bahtForm"
        class="add-form"
        [form]="form()"
        [registry]="registry"
        [value]="formValue()"
        (bahtChange)="changed($any($event).data)"
      ></baht-form>
      @if (kind() === 'playbook' && playbookNames().length === 0) {
        <p class="muted">{{ t('project.schedules.noPlaybook') }}</p>
      } @else {
        <div class="row actions">
          <baht-button variant="primary" [disabled]="busy()" (click)="add(sf.element)">{{
            t('project.schedules.add')
          }}</baht-button>
        </div>
      }
    </baht-card>
  `,
})
export class CronJobsComponent {
  private readonly api = inject(Api).client.api
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  readonly projectId = input.required<string>()
  /** The project's playbooks: what a playbook job can run. */
  readonly playbooks = input<readonly { name: string }[]>([])

  protected readonly schedules = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects/:id/schedules', {
      params: { id: this.projectId() },
    }),
  )
  protected readonly message = signal<{ tone: 'success' | 'danger'; text: string } | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly runsWhat = runsWhat

  protected readonly registry = REGISTRY
  /** What the new cron job runs: the form's first radio cards; it picks the fields that follow. */
  protected readonly kind = signal<ScheduleKind>('claude')
  protected readonly playbookNames = computed(() => this.playbooks().map((p) => p.name))
  protected readonly form = computed(() => scheduleForm(this.t, this.kind(), this.playbookNames()))
  /** What the form holds now: it keeps what was typed when the tabs change the fields. */
  private readonly data = signal<Record<string, unknown>>({
    runs: 'claude',
    when: DEFAULT_CRON,
    use_board: true,
  })
  /** Given to the form again only when Runs changes its fields, never on each keystroke. */
  protected readonly formValue = computed(() => {
    this.kind()
    return untracked(() => this.data())
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

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }

  /** Keeps what was typed; Runs picks the fields the form shows. */
  protected changed(data: Record<string, unknown>): void {
    this.data.update((now) => ({ ...now, ...data }))
    const runs = data['runs']
    if (typeof runs === 'string' && (SCHEDULE_KINDS as readonly string[]).includes(runs))
      this.kind.set(runs as ScheduleKind)
  }

  /** What the new cron job runs, as the API takes it. */
  private runsBody(d: Record<string, unknown>) {
    const kind = this.kind()
    if (kind === 'claude' || kind === 'codex')
      return {
        agent: kind,
        prompt: text(d['prompt']),
        use_board: d['use_board'] === true,
        model: text(d['model']),
      }
    if (kind === 'playbook') return { playbook: text(d['playbook']) }
    return { command: text(d['command']), card_tags: list(d['card_tags']) }
  }

  protected add(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    const when = d['when']
    if (typeof when !== 'string' || cronProblem(when)) {
      this.message.set({ tone: 'danger', text: this.t('project.schedules.previewMissing') })
      return Promise.resolve()
    }
    return this.act(async () => {
      await firstValueFrom(
        this.api.projects({ id: this.projectId() }).schedules.post({
          name: text(d['name']) ?? '',
          ...this.runsBody(d),
          cron: when,
        }),
      )
      form.reset()
      this.data.update((now) => ({ ...now, runs: this.kind() }))
    }, this.t('project.messages.scheduleAdded'))
  }

  protected toggle(id: number, enabled: boolean): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.schedules({ id: String(id) }).patch({ enabled })),
      enabled ? this.t('project.messages.on') : this.t('project.messages.off'),
    )
  }

  /** When a listed job runs, in a few words. */
  protected whenOf(s: { cron: string | null; interval_minutes: number }): string {
    return s.cron ?? this.t('project.schedules.every', { minutes: s.interval_minutes })
  }
}

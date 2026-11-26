import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import {
  MODEL_DEFAULT,
  MODEL_OTHER,
  NO_AGENT,
  REGISTRY,
  scheduleForm,
  scheduleKinds,
  type AgentOptions,
} from '../../shared/forms'
import { DEFAULT_CRON, runsWhat, SCHEDULE_KINDS, type ScheduleKind } from '../../shared/schedule'

/** A new cron job's form before anything is typed. */
const FRESH = {
  when: DEFAULT_CRON,
  use_board: true,
  model: MODEL_DEFAULT,
  claude_agent: NO_AGENT,
} as const

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])

/**
 * One project's cron jobs: the list (turn on or off, the last run) and the form that adds one,
 * what it runs picked with radio cards and when with the library's `schedule` field. On the Cron jobs page, and in the project's settings.
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
          @if (s.claude_agent) {
            <baht-badge
              tone="neutral"
              [label]="t('cron.asAgent', { agent: s.claude_agent })"
            ></baht-badge>
          }
          @if (s.model) {
            <baht-badge tone="neutral" [label]="s.model"></baht-badge>
          }
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
  /** What this machine can run, the project's Claude Code agents and the models; null until read. */
  protected readonly options = signal<AgentOptions | null>(null)
  /** Bumped after a job is added: the form is given its fresh value again. */
  private readonly fresh = signal(0)
  /** The model is "Other…": its name is typed in. */
  private readonly otherModel = signal(false)
  protected readonly playbookNames = computed(() => this.playbooks().map((p) => p.name))
  protected readonly form = computed(() =>
    scheduleForm(this.t, {
      kind: this.kind(),
      playbooks: this.playbookNames(),
      options: this.options(),
      otherModel: this.otherModel(),
    }),
  )
  /** What the form holds now: it keeps what was typed when Runs changes the fields. */
  private readonly data = signal<Record<string, unknown>>({ ...FRESH, runs: 'claude' })
  /** Given to the form again only when its fields change, never on each keystroke. */
  protected readonly formValue = computed(() => {
    this.fresh()
    this.kind()
    this.otherModel()
    this.options()
    return untracked(() => this.data())
  })

  constructor() {
    // the project's options; a CLI this machine has not leaves its card out, and Runs moves on
    effect(() => {
      const id = this.projectId()
      void firstValueFrom(this.api.projects({ id }).agents.get()).then(
        (options) => {
          const kinds = scheduleKinds(options)
          this.options.set(options)
          const first = kinds[0]
          if (first && !kinds.includes(untracked(() => this.kind()))) {
            this.kind.set(first)
            this.data.update((now) => ({ ...now, runs: first }))
          }
        },
        () => {
          this.options.set({ claude: null, codex: null })
        },
      )
    })
  }
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

  /**
   * Keeps what was typed; Runs picks the fields the form shows. Claude's models are not Codex's:
   * another Runs starts the model (and Claude's agent) over.
   */
  protected changed(data: Record<string, unknown>): void {
    const runs = data['runs']
    const kind =
      typeof runs === 'string' && (SCHEDULE_KINDS as readonly string[]).includes(runs)
        ? (runs as ScheduleKind)
        : this.kind()
    const fresh = kind !== this.kind() ? { model: MODEL_DEFAULT, claude_agent: NO_AGENT } : {}
    this.data.update((now) => ({ ...now, ...data, ...fresh }))
    this.kind.set(kind)
    this.otherModel.set(this.data()['model'] === MODEL_OTHER)
  }

  /** The model as the API takes it: null for the CLI's default, the typed name for "Other…". */
  private modelOf(d: Record<string, unknown>): string | null {
    const model = text(d['model'])
    if (model === MODEL_OTHER) return text(d['model_other'])
    // no list to pick from (Codex never ran here): the name is typed in
    if (model === null) return text(d['model_other'])
    return model === MODEL_DEFAULT ? null : model
  }

  /** What the new cron job runs, as the API takes it. */
  private runsBody(d: Record<string, unknown>) {
    const kind = this.kind()
    if (kind === 'claude' || kind === 'codex')
      return {
        agent: kind,
        prompt: text(d['prompt']),
        use_board: d['use_board'] === true,
        model: this.modelOf(d),
        claude_agent:
          kind === 'claude' && text(d['claude_agent']) !== NO_AGENT
            ? text(d['claude_agent'])
            : null,
      }
    if (kind === 'playbook') return { playbook: text(d['playbook']) }
    return { command: text(d['command']), card_tags: list(d['card_tags']) }
  }

  protected add(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    const when = d['when']
    // the schedule field checks the expression itself; this is only its type
    if (typeof when !== 'string') {
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
      // a fresh form for the next one, on the same Runs: emptied, then given its first choices
      form.reset()
      this.data.set({ ...FRESH, runs: this.kind() })
      this.otherModel.set(false)
      this.fresh.update((n) => n + 1)
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

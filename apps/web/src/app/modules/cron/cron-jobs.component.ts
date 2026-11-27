import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { dialog } from '@20baht/ui/overlay'
import { liveSignal } from '@20baht/angular/live'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { liveFailed } from '../../shared/live-state'
import type { CronJob } from '../../shared/cron-wizard'
import { runsWhat } from '../../shared/schedule'
import { BAHT_STICKERS } from '../../shared/stickers'
import { attemptWithNotice, type Notice } from '../../shared/attempt'
import { CronWizardComponent } from './cron-wizard.component'

// the elements this component's template draws: they arrive with it (see src/elements.ts)
import '@20baht/ui/components/alert'
import '@20baht/ui/components/card'
import '@20baht/ui/components/code'
import '@20baht/ui/components/error-state'
import '@20baht/ui/components/skeleton'

/**
 * One project's cron jobs: the list (turn on or off, the last run) and the button that adds one in
 * the three-step wizard. On the Cron jobs page, and in the project's settings.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, BAHT_STICKERS, CronWizardComponent],
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
    /* nothing set yet: a cron clock beside the words, the one moving thing on the empty list */
    .none {
      display: flex;
      align-items: center;
      gap: var(--baht-space-3);
    }
    .none baht-sticker {
      flex: none;
      width: 4rem;
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
    <baht-card
      [heading]="
        projectName() ? t('cron.listHeadingOf', { name: projectName() }) : t('cron.listHeading')
      "
      [subtitle]="t('project.schedules.subtitle')"
    >
      <baht-button data-slot="actions" variant="primary" icon="plus" (click)="add()">{{
        t('cron.add')
      }}</baht-button>
      @if (schedulesFailed()) {
        <baht-error-state
          [heading]="t('cron.jobsLoadError')"
          [message]="t('cron.loadErrorHint')"
          [retryLabel]="t('common.retry')"
          (bahtRetry)="attempt.update((n) => n + 1)"
        ></baht-error-state>
      } @else if (schedules().data === undefined) {
        <baht-skeleton variant="text"></baht-skeleton>
      }
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
          <baht-button
            size="sm"
            variant="ghost"
            icon="pencil"
            [attr.aria-label]="t('cron.editNamed', { name: s.name })"
            (click)="edit(s)"
            >{{ t('cron.edit') }}</baht-button
          >
          <baht-button
            size="sm"
            variant="ghost"
            [disabled]="busy()"
            (click)="toggle(s.id, !s.enabled)"
            >{{
              s.enabled ? t('project.schedules.turnOff') : t('project.schedules.turnOn')
            }}</baht-button
          >
          <baht-button
            size="sm"
            variant="ghost"
            [disabled]="busy()"
            (click)="remove(s.id, s.name)"
            >{{ t('project.schedules.remove') }}</baht-button
          >
        </div>
      } @empty {
        @if (schedules().data) {
          <div class="none">
            <baht-sticker
              name="cron"
              aria-hidden="true"
              [playOnce]="true"
              [enter]="0.1"
              [replayOnHover]="true"
            ></baht-sticker>
            <p class="muted">{{ t('project.schedules.empty') }}</p>
          </div>
        }
      }
    </baht-card>

    <web-cron-wizard
      fixed
      [open]="adding() || editing() !== null"
      [projects]="wizardProjects()"
      [project]="projectId()"
      [job]="editing()"
      (closed)="adding.set(false); editing.set(null)"
      (added)="
        message.set({ tone: 'success', text: t('cron.wizard.added', { name: $event.name }) })
      "
      (saved)="
        message.set({ tone: 'success', text: t('cron.wizard.saved', { name: $event.name }) })
      "
    ></web-cron-wizard>
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
  /** The project's name: said in the heading and the wizard, so it is plain whose jobs these are. */
  readonly projectName = input<string>('')

  /** Bumped by Try again: the subscription is taken anew. */
  protected readonly attempt = signal(0)
  protected readonly schedules = liveSignal(() => {
    this.attempt()
    return this.live.subscribe('GET', '/api/projects/:id/schedules', {
      params: { id: this.projectId() },
    })
  })
  protected readonly schedulesFailed = computed(() => liveFailed(this.schedules()))
  protected readonly message = signal<Notice | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly runsWhat = runsWhat

  /** The one project the wizard adds to (it does not ask which). */
  protected readonly wizardProjects = computed(() => [
    { id: Number(this.projectId()), name: this.projectName(), playbooks: this.playbooks() },
  ])
  /** The wizard that adds a job is open. */
  protected readonly adding = signal(false)
  /** The job the wizard edits; null when it adds one or is shut. */
  protected readonly editing = signal<CronJob | null>(null)

  protected add(): void {
    this.editing.set(null)
    this.adding.set(true)
  }

  protected edit(job: CronJob): void {
    this.adding.set(false)
    this.editing.set(job)
  }

  private async act(work: () => Promise<unknown>, done: string): Promise<void> {
    await attemptWithNotice(this.busy, this.message, async () => {
      await work()
      return done
    })
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }

  protected toggle(id: number, enabled: boolean): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.schedules({ id: String(id) }).patch({ enabled })),
      enabled ? this.t('project.messages.on') : this.t('project.messages.off'),
    )
  }

  /** Removing is a person's choice, asked once more; turning off keeps the job. */
  protected async remove(id: number, name: string): Promise<void> {
    const sure = await dialog.confirm(this.t('project.schedules.removeConfirm', { name }), {
      tone: 'danger',
      confirmText: this.t('project.schedules.remove'),
    })
    if (!sure) return
    await this.act(
      () => firstValueFrom(this.api.schedules({ id: String(id) }).delete()),
      this.t('project.schedules.removed'),
    )
  }

  /** When a listed job runs, in a few words. */
  protected whenOf(s: { cron: string | null; interval_minutes: number }): string {
    return s.cron ?? this.t('project.schedules.every', { minutes: s.interval_minutes })
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { runsWhat } from '../../shared/schedule'
import { CronWizardComponent } from './cron-wizard.component'

/**
 * One project's cron jobs: the list (turn on or off, the last run) and the button that adds one in
 * the three-step wizard. On the Cron jobs page, and in the project's settings.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, CronWizardComponent],
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
    <baht-card [heading]="t('cron.listHeading')" [subtitle]="t('project.schedules.subtitle')">
      <baht-button data-slot="actions" variant="primary" icon="plus" (click)="adding.set(true)">{{
        t('cron.add')
      }}</baht-button>
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

    <web-cron-wizard
      fixed
      [open]="adding()"
      [projects]="wizardProjects()"
      [project]="projectId()"
      (closed)="adding.set(false)"
      (added)="
        message.set({ tone: 'success', text: t('cron.wizard.added', { name: $event.name }) })
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

  protected readonly schedules = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects/:id/schedules', {
      params: { id: this.projectId() },
    }),
  )
  protected readonly message = signal<{ tone: 'success' | 'danger'; text: string } | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly runsWhat = runsWhat

  /** The one project the wizard adds to (it does not ask which). */
  protected readonly wizardProjects = computed(() => [
    { id: Number(this.projectId()), name: '', playbooks: this.playbooks() },
  ])
  /** The wizard that adds a job is open. */
  protected readonly adding = signal(false)

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

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { NotificationItem } from '@20baht/ui'
import { toast } from '@20baht/ui/overlay'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../core/i18n/i18n.service'
import { LiveService } from '../services/live.service'
import { ago } from './format'
import { runLabel } from './schedule'

/** The band on every page: working or paused, the run going, cards in review, alerts. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, RouterLink],
  selector: 'app-status-bar',
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--baht-space-3);
    }
    a {
      color: inherit;
    }
  `,
  template: `
    @if (status().data; as s) {
      @if (s.paused) {
        <baht-badge tone="danger" [label]="t('statusBar.paused')"></baht-badge>
      } @else if (s.running.length > 0) {
        @for (run of s.running; track run.run_id) {
          <a [routerLink]="['/runs', run.run_id]">
            <baht-badge tone="info" busy [label]="runLabel(run)"></baht-badge>
          </a>
        }
      } @else {
        <baht-badge tone="success" [label]="t('statusBar.idle')"></baht-badge>
      }
      @for (p of s.paused_projects; track p.id) {
        <baht-badge
          tone="warning"
          [label]="t('statusBar.projectPaused', { name: p.name })"
        ></baht-badge>
      }
      @if (s.review > 0) {
        <a routerLink="/review">
          <baht-badge
            tone="warning"
            [label]="t('statusBar.review', { count: s.review })"
          ></baht-badge>
        </a>
      }
      <baht-button
        size="sm"
        variant="secondary"
        [label]="s.paused ? t('statusBar.resume') : t('statusBar.pause')"
        (click)="setPaused(!s.paused)"
      ></baht-button>
    }
    <baht-notification-bell
      [label]="t('statusBar.alerts')"
      [emptyMessage]="t('statusBar.noAlerts')"
      [items]="items()"
      [count]="status().data?.unread_alerts ?? 0"
      (bahtMarkAll)="readAll()"
    ></baht-notification-bell>
  `,
})
export class StatusBarComponent {
  private readonly live = inject(LiveService).live
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t
  protected readonly runLabel = runLabel

  protected readonly status = liveSignal(() => this.live.subscribe('GET', '/api/status'))
  private readonly alerts = liveSignal(() =>
    this.live.subscribe('GET', '/api/alerts', { query: {} }),
  )

  protected readonly items = computed<NotificationItem[]>(() =>
    (this.alerts().data ?? []).slice(0, 20).map((alert) => ({
      id: alert.id,
      title: alert.message,
      time: ago(alert.created_at),
      unread: !alert.read,
      tag: {
        label: this.t(`statusBar.level.${alert.level}`),
        tone: alert.level === 'error' ? 'danger' : alert.level === 'warning' ? 'warning' : 'info',
      },
      ...(alert.run_id === null ? {} : { href: `/runs/${String(alert.run_id)}` }),
    })),
  )

  protected setPaused(paused: boolean): Promise<void> {
    return this.act(() => firstValueFrom(this.api.settings.patch({ paused })))
  }

  protected readAll(): Promise<void> {
    const ids = (this.alerts().data ?? []).filter((a) => !a.read).map((a) => a.id)
    return this.act(() => firstValueFrom(this.api.alerts.read.post({ ids })))
  }

  /** The band has no place of its own for an error: a failed Pause must still be seen. */
  private async act(work: () => Promise<unknown>): Promise<void> {
    try {
      await work()
    } catch (error) {
      toast.danger(describeError(error))
    }
  }
}

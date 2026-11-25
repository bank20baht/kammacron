import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { NotificationItem } from '@20baht/ui'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { LiveService } from '../services/live.service'
import { ago } from './format'

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
        <baht-badge tone="danger" label="Worker: paused"></baht-badge>
      } @else if (s.running.length > 0) {
        @for (run of s.running; track run.run_id) {
          <a [routerLink]="['/runs', run.run_id]">
            <baht-badge
              tone="info"
              busy
              [label]="'#' + run.card_id + ' ' + run.card_title"
            ></baht-badge>
          </a>
        }
      } @else {
        <baht-badge tone="success" label="Worker: idle"></baht-badge>
      }
      @for (p of s.paused_projects; track p.id) {
        <baht-badge tone="warning" [label]="p.name + ' paused'"></baht-badge>
      }
      @if (s.review > 0) {
        <a routerLink="/review">
          <baht-badge tone="warning" [label]="'Review ' + s.review"></baht-badge>
        </a>
      }
      <baht-button
        size="sm"
        variant="secondary"
        [label]="s.paused ? 'Resume' : 'Pause'"
        (click)="setPaused(!s.paused)"
      ></baht-button>
    }
    <baht-notification-bell
      label="Alerts"
      empty-message="Nothing needs you"
      [items]="items()"
      [count]="status().data?.unread_alerts ?? 0"
      (bahtMarkAll)="readAll()"
    ></baht-notification-bell>
  `,
})
export class StatusBarComponent {
  private readonly live = inject(LiveService).live
  private readonly api = inject(Api).client.api

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
        label: alert.level,
        tone: alert.level === 'error' ? 'danger' : alert.level === 'warning' ? 'warning' : 'info',
      },
      ...(alert.run_id === null ? {} : { href: `/runs/${String(alert.run_id)}` }),
    })),
  )

  protected async setPaused(paused: boolean): Promise<void> {
    await firstValueFrom(this.api.settings.patch({ paused }))
  }

  protected async readAll(): Promise<void> {
    const ids = (this.alerts().data ?? []).filter((a) => !a.read).map((a) => a.id)
    await firstValueFrom(this.api.alerts.read.post({ ids }))
  }
}

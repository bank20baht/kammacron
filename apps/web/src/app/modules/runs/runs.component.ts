import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { ColumnMap } from '@20baht/ui'

import { LiveService } from '../../services/live.service'
import { ago, cost, duration } from '../../shared/format'
import { RUN_TONE } from '../../shared/tones'

type Row = {
  id: number
  card: string
  status: string
  started: string
  took: string
  turns: string
  cost: string
  pushed: string
}

const COLUMNS: ColumnMap = {
  id: { label: 'Run', numeric: true },
  card: 'Card',
  status: {
    label: 'Status',
    cell: 'badge',
    tone: RUN_TONE,
    busy: { running: true, verifying: true },
  },
  started: 'Started',
  took: 'Took',
  turns: { label: 'Turns', align: 'end' },
  cost: { label: 'Cost', align: 'end' },
  pushed: 'Pushed to',
}

/** Every run, newest first, live; a status to filter by, and older pages on demand. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-runs',
  styles: `
    .bar {
      display: flex;
      gap: var(--baht-space-2);
      align-items: center;
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Runs"
        description="One claude -p per card. Open one to watch it live or stop it."
      ></baht-page-header>
      <div class="bar">
        <baht-tabs
          variant="pill"
          label="Status"
          [tabs]="tabs"
          [value]="status()"
          (bahtChange)="status.set($any($event).value)"
        ></baht-tabs>
      </div>
      <baht-table
        [columns]="columns"
        [items]="rows()"
        [total]="rows().length"
        (bahtRowClick)="open($any($event).row.id)"
      ></baht-table>
      @if ((runs().data ?? []).length >= 100) {
        <baht-button variant="secondary" (click)="limit.set(limit() + 100)">Older runs</baht-button>
      }
    </div>
  `,
})
export class RunsComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly status = signal('')
  protected readonly limit = signal(100)
  protected readonly columns = COLUMNS
  protected readonly tabs = [
    '',
    'running',
    'succeeded',
    'review',
    'reverted',
    'failed',
    'stopped',
    'stale',
  ].map((key) => ({
    key,
    label: key === '' ? 'All' : key,
  }))

  protected readonly runs = liveSignal(() => {
    const status = this.status()
    return this.live.subscribe('GET', '/api/runs', {
      query: { limit: String(this.limit()), ...(status ? { status } : {}) },
    })
  })

  protected readonly rows = computed<Row[]>(() =>
    (this.runs().data ?? []).map((r) => ({
      id: r.id,
      card: `#${String(r.card_id)} ${r.card_title}`,
      status: r.status,
      started: ago(r.started_at),
      took: duration(r.started_at, r.ended_at),
      turns: String(r.num_turns ?? '—'),
      cost: cost(r.cost_usd),
      pushed: r.pushed_to ?? '—',
    })),
  )

  protected open(id: number): void {
    void this.router.navigate(['/runs', id])
  }
}

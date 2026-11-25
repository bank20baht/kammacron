import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { ColumnMap } from '@20baht/ui'

import { LiveService } from '../../services/live.service'
import { cost, duration, stamp } from '../../shared/format'
import { RUN_TONE } from '../../shared/tones'

const PAGE_SIZE = 50

const COLUMNS: ColumnMap = {
  id: { label: 'Run', numeric: true, sortable: true },
  card: { label: 'Card', filterable: true },
  status: {
    label: 'Status',
    cell: 'badge',
    tone: RUN_TONE,
    busy: { running: true, verifying: true },
    filterable: true,
    type: 'choice',
    options: Object.keys(RUN_TONE).map((key) => ({ key, label: key })),
  },
  started: { label: 'Started', sortable: true, type: 'date' },
  took: 'Took',
  turns: { label: 'Turns', align: 'end', sortable: true },
  cost: { label: 'Cost', align: 'end', sortable: true },
  pushed: { label: 'Pushed to', filterable: true },
  error: { label: 'Error', filterable: true },
}

type Query = {
  term?: string | undefined
  sort?: { key: string; dir: 'asc' | 'desc' } | undefined
  columns?: Record<string, string> | undefined
  page: number
  pageSize: number
}

/**
 * Every run, live: searched, filtered, sorted and paged on the server (@20baht/table-query),
 * so a long history stays one page in the browser.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-runs',
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Runs"
        description="One claude -p per card. Open one to watch it live or stop it."
      >
        <baht-search
          placeholder="Card, summary or error"
          (bahtSearch)="search($any($event).value)"
        ></baht-search>
      </baht-page-header>
      <baht-table
        [columns]="columns"
        [items]="rows()"
        [total]="total()"
        [page]="query().page"
        [totalPages]="pages()"
        [loading]="runs().status === 'connecting' && !runs().data"
        sortable
        column-search
        clickable
        empty-message="No runs yet"
        (bahtRowClick)="open($any($event).row.id)"
        (bahtSortChange)="sort($any($event))"
        (bahtPageChange)="go($any($event).page)"
        (bahtColumnSearchChange)="filter($any($event).columns)"
      ></baht-table>
    </div>
  `,
})
export class RunsComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly columns = COLUMNS
  protected readonly query = signal<Query>({ page: 1, pageSize: PAGE_SIZE })

  protected readonly runs = liveSignal(() =>
    this.live.subscribe('POST', '/api/runs/search', { body: this.query() }),
  )
  protected readonly total = computed(() => this.runs().data?.total ?? 0)
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)))
  protected readonly rows = computed(() =>
    (this.runs().data?.rows ?? []).map((r) => ({
      id: r.id,
      card: `#${String(r.card_id)} ${r.card_title}`,
      status: r.status,
      started: stamp(r.started_at),
      took: duration(r.started_at, r.ended_at),
      turns: String(r.num_turns ?? '—'),
      cost: cost(r.cost_usd),
      pushed: r.pushed_to ?? '—',
      error: r.error_kind ?? '',
    })),
  )

  protected search(term: string): void {
    this.query.update((q) => ({ ...q, term: term || undefined, page: 1 }))
  }

  protected sort(event: { key?: string; direction?: 'asc' | 'desc' | null }): void {
    const { key, direction: dir } = event
    this.query.update((q) => ({ ...q, sort: key && dir ? { key, dir } : undefined, page: 1 }))
  }

  protected filter(columns: Record<string, string>): void {
    this.query.update((q) => ({ ...q, columns, page: 1 }))
  }

  protected go(page: number): void {
    this.query.update((q) => ({ ...q, page }))
  }

  protected open(id: number): void {
    void this.router.navigate(['/runs', id])
  }
}

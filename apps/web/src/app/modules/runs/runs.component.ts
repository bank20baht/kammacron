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
  card: 'Card',
  status: {
    label: 'Status',
    cell: 'badge',
    tone: RUN_TONE,
    busy: { running: true, verifying: true },
  },
  started: { label: 'Started', sortable: true },
  took: 'Duration',
  turns: { label: 'Turns', align: 'end', sortable: true },
  cost: { label: 'Cost (API equivalent)', align: 'end', sortable: true },
  pushed: 'Branch',
}

const STATUSES = ['running', 'succeeded', 'review', 'reverted', 'failed', 'stopped', 'stale']

type Condition = { field: string; op: 'eq'; value: string }
type Query = {
  term?: string | undefined
  sort?: { key: string; dir: 'asc' | 'desc' } | undefined
  filter?: { match: 'all'; conditions: Condition[] } | undefined
  page: number
  pageSize: number
}

/**
 * Every run, live: one search box, a status and a project filter, sorted and paged on the
 * server (@20baht/table-query).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  styles: `
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: var(--baht-space-3);
      align-items: center;
    }
    .tools baht-search {
      flex: 1 1 18rem;
    }
    .muted {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  selector: 'web-runs',
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Runs"
        description="Every claude -p, newest first. Open one to watch it live or stop it."
      ></baht-page-header>
      <div class="tools">
        <baht-search
          placeholder="Search cards, summaries or errors"
          label="Search runs"
          (bahtSearch)="search($any($event).value)"
        ></baht-search>
        <span class="muted">Status</span>
        <baht-filter
          label="Status"
          [options]="statusOptions"
          [selected]="status()"
          (bahtChange)="setStatus($any($event).selected)"
        ></baht-filter>
        @if (projectOptions().length > 1) {
          <span class="muted">Project</span>
          <baht-filter
            label="Project"
            [options]="projectOptions()"
            [selected]="project()"
            (bahtChange)="setProject($any($event).selected)"
          ></baht-filter>
        }
      </div>
      <baht-table
        [showIndex]="false"
        [columns]="columns"
        [items]="rows()"
        [total]="total()"
        [page]="query().page"
        [totalPages]="pages()"
        [loading]="!runs().data"
        sortable
        clickable
        empty-message="No runs match"
        (bahtRowClick)="open($any($event).row.id)"
        (bahtSortChange)="sort($any($event))"
        (bahtPageChange)="go($any($event).page)"
      ></baht-table>
    </div>
  `,
})
export class RunsComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly columns = COLUMNS
  protected readonly statusOptions = STATUSES.map((key) => ({ key, label: key }))
  protected readonly query = signal<Query>({ page: 1, pageSize: PAGE_SIZE })
  /** One of each at a time: the filter's conditions must all hold. */
  protected readonly status = signal<string[]>([])
  protected readonly project = signal<string[]>([])

  private readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  protected readonly projectOptions = computed(() =>
    (this.projects().data ?? []).map((p) => ({ key: String(p.id), label: p.name })),
  )

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
    })),
  )

  private refilter(): void {
    const conditions: Condition[] = [
      ...this.status().map((value) => ({ field: 'status', op: 'eq' as const, value })),
      ...this.project().map((value) => ({ field: 'project', op: 'eq' as const, value })),
    ]
    this.query.update((q) => ({
      ...q,
      page: 1,
      filter: conditions.length ? { match: 'all', conditions } : undefined,
    }))
  }

  protected search(term: string): void {
    this.query.update((q) => ({ ...q, term: term || undefined, page: 1 }))
  }

  protected setStatus(selected: string[]): void {
    this.status.set(selected.slice(-1))
    this.refilter()
  }

  protected setProject(selected: string[]): void {
    this.project.set(selected.slice(-1))
    this.refilter()
  }

  protected sort(event: { key?: string; direction?: 'asc' | 'desc' | null }): void {
    const { key, direction: dir } = event
    this.query.update((q) => ({ ...q, sort: key && dir ? { key, dir } : undefined, page: 1 }))
  }

  protected go(page: number): void {
    this.query.update((q) => ({ ...q, page }))
  }

  protected open(id: number): void {
    void this.router.navigate(['/runs', id])
  }
}

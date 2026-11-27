import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { ColumnMap } from '@20baht/ui'

import { workerIllustration } from '../../shared/illustration/illustration.registry'
import { IllustratedCardComponent } from '../../shared/illustration/illustrated-card.component'
import { I18n, type Translate } from '../../core/i18n/i18n.service'
import { status } from '../../core/i18n/en/status'
import { LiveService } from '../../services/live.service'
import { cost, duration, stamp } from '../../shared/format'
import { runLabel } from '../../shared/schedule'
import { RUN_TONE } from '../../shared/tones'

const PAGE_SIZE = 50

/** A run status the catalog names (`status.run.*`). */
const isRunStatus = (value: unknown): value is keyof typeof status.run =>
  typeof value === 'string' && Object.hasOwn(status.run, value)

/** A run status in the locale's words; one the catalog lacks shows as it is. */
export const runStatusLabel = (t: Translate, value: unknown): string =>
  isRunStatus(value) ? t(`status.run.${value}`) : String(value)

const runColumns = (t: Translate): ColumnMap => ({
  id: { label: t('runs.column.id'), numeric: true, sortable: true },
  card: t('runs.column.card'),
  status: {
    label: t('runs.column.status'),
    cell: 'badge',
    tone: RUN_TONE,
    labels: (value) => runStatusLabel(t, value),
    busy: { running: true },
  },
  started: { label: t('runs.column.started'), sortable: true },
  took: t('runs.column.took'),
  turns: { label: t('runs.column.turns'), align: 'end', sortable: true },
  cost: { label: t('runs.column.cost'), align: 'end', sortable: true },
})

const STATUSES: (keyof typeof status.run)[] = [
  'running',
  'succeeded',
  'review',
  'failed',
  'stopped',
  'stale',
]

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
  imports: [BAHT_UI, IllustratedCardComponent],
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
        [heading]="t('runs.heading')"
        [description]="t('runs.description')"
      ></baht-page-header>
      @if (worker().data; as worker) {
        <app-illustrated-card [art]="workerIllustration(worker)">
          <baht-section-header
            [heading]="t('identity.worker')"
            [description]="t('identity.philosophy')"
          />
          <baht-badge
            [tone]="worker.paused ? 'warning' : worker.running.length > 0 ? 'info' : 'neutral'"
            [busy]="!worker.paused && worker.running.length > 0"
            [label]="
              worker.paused
                ? t('statusBar.paused')
                : worker.running.length > 0
                  ? t('board.claudeWorking')
                  : t('statusBar.idle')
            "
          />
        </app-illustrated-card>
      }
      <div class="tools">
        <baht-search
          [placeholder]="t('runs.searchPlaceholder')"
          [label]="t('runs.searchLabel')"
          (bahtSearch)="search($event.value)"
        ></baht-search>
        <span class="muted">{{ t('runs.status') }}</span>
        <baht-filter
          [label]="t('runs.status')"
          [options]="statusOptions()"
          [selected]="status()"
          (bahtChange)="setStatus($event.selected)"
        ></baht-filter>
        @if (projectOptions().length > 1) {
          <span class="muted">{{ t('runs.project') }}</span>
          <baht-filter
            [label]="t('runs.project')"
            [options]="projectOptions()"
            [selected]="project()"
            (bahtChange)="setProject($event.selected)"
          ></baht-filter>
        }
      </div>
      <baht-table
        [showIndex]="false"
        [columns]="columns()"
        [items]="rows()"
        [total]="total()"
        [page]="query().page"
        [totalPages]="pages()"
        [loading]="!runs().data"
        sortable
        clickable
        [emptyMessage]="t('runs.empty')"
        (bahtRowClick)="open($event.id)"
        (bahtSortChange)="sort($event)"
        (bahtPageChange)="go($event.page)"
      ></baht-table>
    </div>
  `,
})
export class RunsComponent {
  protected readonly workerIllustration = workerIllustration
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  protected readonly columns = computed(() => runColumns(this.t))
  /** The raw status is the filter's value, sent to the server; the label is the locale's. */
  protected readonly statusOptions = computed(() =>
    STATUSES.map((key) => ({ key, label: this.t(`status.run.${key}`) })),
  )
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

  protected readonly worker = liveSignal(() => this.live.subscribe('GET', '/api/status'))

  protected readonly runs = liveSignal(() =>
    this.live.subscribe('POST', '/api/runs/search', { body: this.query() }),
  )
  protected readonly total = computed(() => this.runs().data?.total ?? 0)
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)))
  protected readonly rows = computed(() =>
    (this.runs().data?.rows ?? []).map((r) => ({
      id: r.id,
      card: runLabel(r),
      status: r.status,
      started: stamp(r.started_at),
      took: duration(r.started_at, r.ended_at),
      turns: String(r.num_turns ?? '—'),
      cost: cost(r.cost_usd),
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

  protected open(id: number | undefined): void {
    if (id !== undefined) void this.router.navigate(['/runs', id])
  }
}

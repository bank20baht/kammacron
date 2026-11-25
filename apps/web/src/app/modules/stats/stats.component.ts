import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import type { ChartSeries, ColumnMap } from '@20baht/ui'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { cost } from '../../shared/format'

const WEEK_COLUMNS: ColumnMap = {
  week: 'Week',
  runs: { label: 'Runs', numeric: true },
  done: { label: 'Shipped', numeric: true },
  review: { label: 'Review', numeric: true },
  reverted: { label: 'Reverted', numeric: true },
  cost: { label: 'Cost (API equivalent)', align: 'end' },
}

/** What the worker did, week by week: shipped, handed back, reverted, and what it cost. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-stats',
  styles: `
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
      gap: var(--baht-space-4);
    }
    .charts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
      gap: var(--baht-space-4);
    }
    .money {
      margin: 0;
      font-size: var(--baht-text-2xl);
      font-weight: var(--baht-font-weight-label);
      font-variant-numeric: tabular-nums;
    }
    .muted {
      margin: 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header heading="Stats" description="What the worker did, week by week.">
        <baht-tabs
          variant="pill"
          label="Weeks"
          [tabs]="ranges"
          [value]="String(weeks())"
          (bahtChange)="weeks.set(Number($any($event).value))"
        ></baht-tabs>
      </baht-page-header>
      @if (stats.value(); as s) {
        <div class="stats">
          <baht-card><baht-stat label="Runs" [value]="s.total.runs"></baht-stat></baht-card>
          <baht-card
            ><baht-stat label="Shipped by Claude" [value]="s.total.done"></baht-stat
          ></baht-card>
          <baht-card>
            <baht-stat
              label="Sent to review"
              [value]="s.total.review_rate"
              format="percent"
              [upIsGood]="false"
            ></baht-stat>
            <p class="muted">{{ s.total.review }} of {{ s.total.runs }}</p>
          </baht-card>
          <baht-card>
            <!-- baht-stat formats currency without cents (LIB_GAP): $0.009 would read $0 -->
            <p class="muted">Cost (API equivalent)</p>
            <p class="money">{{ cost(s.total.cost) }}</p>
            <p class="muted">
              An estimate Claude Code reports; a subscription token is not billed it.
            </p>
          </baht-card>
        </div>
        @if (s.total.runs <= 1) {
          <baht-alert tone="info" message="Only one run in this period: no trend yet."></baht-alert>
        }
        <div class="charts">
          <baht-card heading="Weekly outcomes">
            <baht-bar-chart
              label="Runs per week"
              stacked
              [categories]="categories()"
              [series]="series()"
              empty-message="No runs yet"
            ></baht-bar-chart>
          </baht-card>
          <baht-card heading="Weekly cost">
            <baht-line-chart
              label="Cost per week"
              format="number"
              [categories]="categories()"
              [series]="costSeries()"
              empty-message="No runs yet"
            ></baht-line-chart>
            <p class="muted">In US cents, API equivalent (the chart rounds to whole numbers).</p>
          </baht-card>
        </div>
        <baht-table
          [showIndex]="false"
          [columns]="weekColumns"
          [items]="weekRows()"
          [total]="weekRows().length"
          empty-message="No runs yet"
        ></baht-table>
      } @else {
        <baht-skeleton variant="text"></baht-skeleton>
      }
    </div>
  `,
})
export class StatsComponent {
  private readonly api = inject(Api).client.api
  protected readonly weeks = signal(8)
  protected readonly ranges = [4, 8, 26, 52].map((n) => ({
    key: String(n),
    label: `${String(n)} weeks`,
  }))
  protected readonly String = String
  protected readonly Number = Number
  protected readonly cost = cost
  protected readonly weekColumns = WEEK_COLUMNS
  protected readonly stats = resource({
    params: () => this.weeks(),
    loader: ({ params }) => firstValueFrom(this.api.stats.get({ query: { weeks: params } })),
  })
  protected readonly categories = computed(() =>
    (this.stats.value()?.weeks ?? []).map((w) => w.week),
  )
  protected readonly series = computed<ChartSeries[]>(() => {
    const weeks = this.stats.value()?.weeks ?? []
    return [
      { name: 'Shipped', values: weeks.map((w) => w.done) },
      { name: 'Review', values: weeks.map((w) => w.review) },
      { name: 'Reverted', values: weeks.map((w) => w.reverted) },
      { name: 'Failed or stopped', values: weeks.map((w) => w.failed) },
    ]
  })
  protected readonly costSeries = computed<ChartSeries[]>(() => [
    {
      name: 'Cost (US cents)',
      values: (this.stats.value()?.weeks ?? []).map((w) => Math.round(w.cost * 100)),
    },
  ])
  protected readonly weekRows = computed(() =>
    (this.stats.value()?.weeks ?? []).map((w) => ({
      week: w.week,
      runs: w.runs,
      done: w.done,
      review: w.review,
      reverted: w.reverted,
      cost: cost(w.cost),
    })),
  )
}

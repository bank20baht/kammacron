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

import { currentLocale, I18n, type Translate } from '../../core/i18n/i18n.service'
import { cost } from '../../shared/format'

const columnsOf = (t: Translate): ColumnMap => ({
  week: t('stats.column.week'),
  runs: { label: t('stats.column.runs'), numeric: true },
  done: { label: t('stats.column.done'), numeric: true },
  review: { label: t('stats.column.review'), numeric: true },
  cost: { label: t('stats.column.cost'), align: 'end' },
})

/** What the worker did, week by week: done, handed back, failed, and what it cost. */
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
    .muted {
      margin: 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header [heading]="t('stats.heading')" [description]="t('stats.description')">
        <baht-tabs
          variant="pill"
          [label]="t('stats.weeksLabel')"
          [tabs]="ranges()"
          [value]="String(weeks())"
          (bahtChange)="weeks.set(Number($any($event).value))"
        ></baht-tabs>
      </baht-page-header>
      @if (stats.value(); as s) {
        <div class="stats">
          <baht-card
            ><baht-stat [label]="t('stats.runs')" [value]="s.total.runs"></baht-stat
          ></baht-card>
          <baht-card
            ><baht-stat [label]="t('stats.shippedByClaude')" [value]="s.total.done"></baht-stat
          ></baht-card>
          <baht-card>
            <baht-stat
              [label]="t('stats.sentToReview')"
              [value]="s.total.review_rate"
              format="percent"
              [upIsGood]="false"
            ></baht-stat>
            <p class="muted">
              {{ t('stats.reviewOf', { review: s.total.review, runs: s.total.runs }) }}
            </p>
          </baht-card>
          <baht-card>
            <baht-stat
              [label]="t('stats.cost')"
              [value]="s.total.cost"
              format="currency"
              currency="USD"
            ></baht-stat>
            <p class="muted">
              {{ t('stats.costNote') }}
            </p>
          </baht-card>
        </div>
        @if (s.total.runs <= 1) {
          <baht-alert tone="info" [message]="t('stats.noTrend')"></baht-alert>
        }
        <div class="charts">
          <baht-card [heading]="t('stats.outcomes')">
            <baht-bar-chart
              [label]="t('stats.runsPerWeek')"
              stacked
              [categories]="categories()"
              [series]="series()"
              [emptyMessage]="t('stats.empty')"
              [locale]="locale()"
            ></baht-bar-chart>
          </baht-card>
          <baht-card [heading]="t('stats.weeklyCost')">
            <baht-line-chart
              [label]="t('stats.costPerWeek')"
              format="currency"
              currency="USD"
              [categories]="categories()"
              [series]="costSeries()"
              [emptyMessage]="t('stats.empty')"
              [locale]="locale()"
            ></baht-line-chart>
            <p class="muted">{{ t('stats.costUnit') }}</p>
          </baht-card>
        </div>
        <baht-table
          [showIndex]="false"
          [columns]="weekColumns()"
          [items]="weekRows()"
          [total]="weekRows().length"
          [emptyMessage]="t('stats.empty')"
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
  protected readonly t = inject(I18n).t
  protected readonly locale = currentLocale
  protected readonly ranges = computed(() =>
    [4, 8, 26, 52].map((n) => ({ key: String(n), label: this.t('stats.weeks', { count: n }) })),
  )
  protected readonly String = String
  protected readonly Number = Number
  protected readonly cost = cost
  protected readonly weekColumns = computed(() => columnsOf(this.t))
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
      { name: this.t('stats.series.shipped'), values: weeks.map((w) => w.done) },
      { name: this.t('stats.series.review'), values: weeks.map((w) => w.review) },
      { name: this.t('stats.series.failed'), values: weeks.map((w) => w.failed) },
    ]
  })
  protected readonly costSeries = computed<ChartSeries[]>(() => [
    {
      name: this.t('stats.series.cost'),
      values: (this.stats.value()?.weeks ?? []).map((w) => w.cost),
    },
  ])
  protected readonly weekRows = computed(() =>
    (this.stats.value()?.weeks ?? []).map((w) => ({
      week: w.week,
      runs: w.runs,
      done: w.done,
      review: w.review,
      cost: cost(w.cost),
    })),
  )
}

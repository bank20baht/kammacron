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
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { IllustratedCardComponent } from '../../shared/illustration/illustrated-card.component'
import { currentLocale, I18n, type Translate } from '../../core/i18n/i18n.service'
import { cost } from '../../shared/format'

const columnsOf = (t: Translate): ColumnMap => ({
  week: t('stats.column.week'),
  runs: { label: t('stats.column.runs'), numeric: true },
  done: { label: t('stats.column.done'), numeric: true },
  review: { label: t('stats.column.review'), numeric: true },
  cost: { label: t('stats.column.cost'), align: 'end' },
})

/**
 * Run outcomes in the app's status colours (done green, review gold, failed red), the same in both
 * themes: checked with the dataviz palette validator (CVD ΔE 12.5, normal-vision 21.4).
 */
const OUTCOME = { done: '#1f7a4d', review: '#c98a00', failed: '#c8202f' } as const

/** What the worker did, week by week: done, handed back, failed, and what it cost. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IllustratedCardComponent, BAHT_UI],
  selector: 'web-stats',
  styles: `
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: var(--baht-space-4);
    }
    .charts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
      gap: var(--baht-space-4);
    }
    .ranges {
      max-width: 100%;
      overflow-x: auto;
    }
    .muted {
      margin: 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        [heading]="t('stats.heading')"
        [description]="t('stats.description')"
      ></baht-page-header>
      <div class="ranges">
        <baht-tabs
          variant="pill"
          [label]="t('stats.weeksLabel')"
          [tabs]="ranges()"
          [value]="String(weeks())"
          (bahtChange)="weeks.set(Number($event.value))"
        ></baht-tabs>
      </div>
      @if (stats.error(); as e) {
        <baht-error-state
          [heading]="t('stats.loadError')"
          [message]="describeError(e)"
          [retryLabel]="t('common.retry')"
          (bahtRetry)="stats.reload()"
        ></baht-error-state>
      } @else if (stats.isLoading() || !stats.hasValue()) {
        <baht-skeleton variant="text"></baht-skeleton>
      } @else if (loaded(); as s) {
        <div class="stats">
          <app-illustrated-card [metric]="true" art="gear"
            ><baht-stat [label]="t('stats.runs')" [value]="s.total.runs"></baht-stat
          ></app-illustrated-card>
          <app-illustrated-card [metric]="true" art="rice"
            ><baht-stat [label]="t('stats.shippedByClaude')" [value]="s.total.done"></baht-stat
          ></app-illustrated-card>
          <app-illustrated-card [metric]="true" art="mirror">
            <baht-stat
              [label]="t('stats.sentToReview')"
              [value]="s.total.review_rate"
              format="percent"
              [upIsGood]="false"
            ></baht-stat>
            <p class="muted">
              {{ t('stats.reviewOf', { review: s.total.review, runs: s.total.runs }) }}
            </p>
          </app-illustrated-card>
          <app-illustrated-card [metric]="true" art="banknote">
            <baht-stat
              [label]="t('stats.cost')"
              [value]="s.total.cost"
              format="currency"
              currency="USD"
            ></baht-stat>
            <p class="muted">
              {{ t('stats.costNote') }}
            </p>
          </app-illustrated-card>
        </div>
        @if (s.total.runs === 0) {
          <baht-alert tone="info" [message]="t('stats.noRuns')"></baht-alert>
        } @else if (s.total.runs === 1) {
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
  protected readonly describeError = describeError
  /** The answer for the weeks picked now; `value()` throws while the request has failed. */
  protected readonly loaded = computed(() => (this.stats.hasValue() ? this.stats.value() : null))
  private readonly weeksOf = computed(() => this.loaded()?.weeks ?? [])
  protected readonly categories = computed(() => this.weeksOf().map((w) => w.week))
  protected readonly series = computed<ChartSeries[]>(() => {
    const weeks = this.weeksOf()
    return [
      {
        name: this.t('stats.series.shipped'),
        values: weeks.map((w) => w.done),
        color: OUTCOME.done,
      },
      {
        name: this.t('stats.series.review'),
        values: weeks.map((w) => w.review),
        color: OUTCOME.review,
      },
      {
        name: this.t('stats.series.failed'),
        values: weeks.map((w) => w.failed),
        color: OUTCOME.failed,
      },
    ]
  })
  protected readonly costSeries = computed<ChartSeries[]>(() => [
    {
      name: this.t('stats.series.cost'),
      values: this.weeksOf().map((w) => w.cost),
    },
  ])
  protected readonly weekRows = computed(() =>
    this.weeksOf().map((w) => ({
      week: w.week,
      runs: w.runs,
      done: w.done,
      review: w.review,
      cost: cost(w.cost),
    })),
  )
}

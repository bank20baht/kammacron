import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import type { ChartSeries } from '@20baht/ui'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

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
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Stats"
        description="Runs per week. Cost is what Claude Code reports as the API equivalent; a subscription token pays none of it."
      >
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
          <baht-stat label="Runs" [value]="s.total.runs" [trend]="trend('runs')"></baht-stat>
          <baht-stat
            label="Shipped by Claude"
            [value]="s.total.done"
            [trend]="trend('done')"
          ></baht-stat>
          <baht-stat
            label="Sent to review"
            [value]="s.total.review_rate"
            format="percent"
            [upIsGood]="false"
          ></baht-stat>
          <baht-stat
            label="Cost (API equivalent)"
            [value]="s.total.cost"
            format="currency"
            currency="USD"
            [upIsGood]="false"
          ></baht-stat>
        </div>
        <baht-card heading="Per week">
          <baht-bar-chart
            label="Runs per week"
            stacked
            [categories]="categories()"
            [series]="series()"
            empty-message="No runs yet"
          ></baht-bar-chart>
        </baht-card>
        <baht-card heading="Cost per week">
          <baht-line-chart
            label="Cost per week"
            format="currency"
            currency="USD"
            [categories]="categories()"
            [series]="costSeries()"
            empty-message="No runs yet"
          ></baht-line-chart>
        </baht-card>
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
    { name: 'Cost', values: (this.stats.value()?.weeks ?? []).map((w) => w.cost) },
  ])
  protected trend(key: 'runs' | 'done'): number[] {
    return (this.stats.value()?.weeks ?? []).map((w) => w[key])
  }
}

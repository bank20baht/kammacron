import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { ago } from '../../shared/format'

type LimitWindow = { key: string; minutes: number; used: number; resets_at: string | null }
type AgentLimits = {
  windows: LimitWindow[]
  plan: string | null
  as_of: string | null
  run_id: number | null
}
type Limits = { claude: AgentLimits | null; codex: AgentLimits | null }

/** Read again this often while the page is open: Codex's files change as it is used. */
const REFRESH_MS = 60_000

/**
 * How much of Claude's and Codex's usage windows is spent, above the Cron jobs: a meter a window,
 * with the pace marker where the window's time is, and when it starts over. An agent this machine
 * has not shows nothing; one without numbers yet says where they will come from.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-usage-limits',
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
      gap: var(--baht-space-3);
    }
    :host(:empty) {
      display: none;
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-bottom: var(--baht-space-2);
    }
    .name {
      font-weight: 600;
    }
    .as-of {
      margin-inline-start: auto;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-font-size-sm);
    }
    .window + .window {
      margin-top: var(--baht-space-3);
    }
    .resets,
    .empty {
      margin: var(--baht-space-1) 0 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-font-size-sm);
    }
  `,
  template: `
    @for (a of agents(); track a.key) {
      <!-- fill: side by side, the cards share the taller one's height, numbers or not -->
      <baht-card fill>
        <div class="top">
          <baht-icon [name]="a.key === 'claude' ? 'sparkles' : 'code'"></baht-icon>
          <span class="name">{{ a.name }}</span>
          @if (a.limits.plan) {
            <baht-badge tone="info" [label]="a.limits.plan"></baht-badge>
          }
          @if (a.limits.as_of) {
            <span class="as-of">{{ asOf(a.key, a.limits) }}</span>
          }
        </div>
        @for (w of a.limits.windows; track w.key) {
          <div class="window">
            <baht-meter
              kind="capacity"
              format="percent"
              [label]="windowName(w.minutes)"
              [value]="w.used"
              [max]="1"
              [expected]="pace(w)"
            ></baht-meter>
            @if (w.resets_at) {
              <p class="resets">{{ t('cron.limits.resets', { when: ago(w.resets_at) }) }}</p>
            }
          </div>
        } @empty {
          <p class="empty">{{ a.none }}</p>
        }
      </baht-card>
    }
  `,
})
export class UsageLimitsComponent {
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t
  protected readonly ago = ago
  private readonly limits = signal<Limits | null>(null)

  /** The agents this machine has, Claude first. */
  protected readonly agents = computed(() => {
    const l = this.limits()
    if (!l) return []
    return (['claude', 'codex'] as const).flatMap((key) => {
      const limits = l[key]
      return limits
        ? [
            {
              key,
              limits,
              name: this.t(`cron.limits.${key}`),
              none: this.t(`cron.limits.none.${key}`),
            },
          ]
        : []
    })
  })

  constructor() {
    void this.read()
    const timer = setInterval(() => void this.read(), REFRESH_MS)
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer)
    })
  }

  private async read(): Promise<void> {
    try {
      this.limits.set(await firstValueFrom(this.api.limits.get()))
    } catch {
      // no numbers this time: the cards keep what they showed
    }
  }

  /** "5 hours", "7 days": a window by its length. */
  protected windowName(minutes: number): string {
    if (minutes % 1440 === 0) return this.t('cron.limits.days', { n: minutes / 1440 })
    if (minutes % 60 === 0) return this.t('cron.limits.hours', { n: minutes / 60 })
    return this.t('cron.limits.minutes', { n: minutes })
  }

  /** Where the window's time is now (0 to 1): spending at that pace lasts the window. */
  protected pace(w: LimitWindow): number | null {
    if (!w.resets_at) return null
    const left = new Date(w.resets_at).getTime() - Date.now()
    const length = w.minutes * 60_000
    return Math.min(1, Math.max(0, 1 - left / length))
  }

  /** Where the numbers come from, and when they were read. */
  protected asOf(key: 'claude' | 'codex', l: AgentLimits): string {
    const when = ago(l.as_of)
    return key === 'claude' && l.run_id !== null
      ? this.t('cron.limits.asOfRun', { run: l.run_id, when })
      : this.t('cron.limits.asOf', { when })
  }
}

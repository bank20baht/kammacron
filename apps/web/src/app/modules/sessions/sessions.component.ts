import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import { dialog } from '@20baht/ui/overlay'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { attemptWithNotice, type Notice } from '../../shared/attempt'
import { ago } from '../../shared/format'
import { UsageLimitsComponent } from '../cron/limits.component'
import { compact, sessionGroups, summaryOf, type LocalSession } from './local-sessions'

// the elements this component's template draws: they arrive with it (see src/elements.ts)
import '@20baht/ui/components/alert'
import '@20baht/ui/components/badge'
import '@20baht/ui/components/button'
import '@20baht/ui/components/card'
import '@20baht/ui/components/empty-state'
import '@20baht/ui/components/error-state'
import '@20baht/ui/components/page-header'
import '@20baht/ui/components/skeleton'

/** Read again this often while the page is in view: a session's status changes by the second. */
const REFRESH_MS = 3000

/**
 * Every Claude Code and Codex session open on this machine: which spend tokens now, which sit
 * idle, which look stuck, and Stop for one or for all that are working. Not live from the
 * database (nothing of it is kept there): the page asks every few seconds while it is in view.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, UsageLimitsComponent],
  selector: 'web-sessions',
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
    }
    .grow {
      flex: 1;
    }
    .rows {
      display: grid;
      gap: var(--baht-space-2);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 2.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) auto;
      align-items: center;
      gap: var(--baht-space-3);
      padding: var(--baht-space-3);
      border: 1px solid var(--baht-color-border);
      border-radius: var(--baht-radius-md);
      background: var(--baht-color-surface);
    }
    .row.working {
      border-color: var(--baht-color-primary);
    }
    .row.quiet {
      border-color: var(--baht-color-warning);
    }
    @media (max-width: 760px) {
      .row {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .tokens {
        grid-column: 1 / -1;
      }
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .muted,
    .cwd {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
    .cwd {
      font-family: var(--baht-font-mono);
      overflow-wrap: anywhere;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--baht-space-1);
      margin-top: var(--baht-space-1);
    }
    .tokens {
      display: grid;
      gap: 2px;
      font-size: var(--baht-text-sm);
    }
    .tokens strong {
      font-variant-numeric: tabular-nums;
    }
    .warn {
      color: var(--baht-color-warning-text, var(--baht-color-warning));
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header [heading]="t('sessions.heading')" [description]="t('sessions.description')">
        @if (summary().working + summary().shell > 0) {
          <baht-button variant="danger" icon="power" [loading]="busy()" (click)="stopWorking()">{{
            t('sessions.stopWorking', { count: summary().working + summary().shell })
          }}</baht-button>
        }
      </baht-page-header>

      <web-usage-limits></web-usage-limits>

      @if (notice(); as n) {
        <baht-alert
          [tone]="n.tone"
          [message]="n.text"
          dismissible
          (bahtDismiss)="notice.set(null)"
        ></baht-alert>
      }

      @if (failed(); as error) {
        <baht-error-state [heading]="t('sessions.loadFailed')" [message]="error"></baht-error-state>
      } @else if (sessions(); as all) {
        <div class="bar muted">
          <span>{{ t('sessions.summary.working', { count: summary().working }) }}</span>
          <span>·</span>
          <span>{{ t('sessions.summary.shell', { count: summary().shell }) }}</span>
          <span>·</span>
          <span>{{ t('sessions.summary.idle', { count: summary().idle }) }}</span>
          @if (summary().quiet > 0) {
            <span>·</span>
            <span class="warn">{{ t('sessions.summary.quiet', { count: summary().quiet }) }}</span>
          }
        </div>
        @if (all.length === 0) {
          <baht-empty-state [message]="t('sessions.empty')"></baht-empty-state>
        } @else {
          @for (group of groups(); track group.key) {
            <baht-card [heading]="groupLabel(group.key)">
              @if (group.sessions.length === 0) {
                <p class="muted">{{ t('sessions.noneWorking') }}</p>
              }
              <div class="rows">
                @for (s of group.sessions; track s.agent + s.id) {
                  <div class="row" [class.working]="s.status !== 'idle'" [class.quiet]="s.quiet">
                    <div>
                      <div class="name">{{ s.name }}</div>
                      <div class="cwd">{{ s.cwd }}</div>
                      <div class="badges">
                        <baht-badge tone="neutral" [label]="agentLabel(s)"></baht-badge>
                        <baht-badge
                          [tone]="s.status === 'idle' ? 'neutral' : 'info'"
                          [busy]="s.status === 'working'"
                          [label]="statusLabel(s)"
                        ></baht-badge>
                        <baht-badge
                          [tone]="s.billing === 'api' ? 'warning' : 'neutral'"
                          [label]="billingLabel(s)"
                          [title]="billingHelp(s)"
                        ></baht-badge>
                        @if (s.run_id !== null) {
                          <baht-badge
                            tone="info"
                            [label]="t('sessions.run', { id: s.run_id })"
                          ></baht-badge>
                        }
                      </div>
                    </div>
                    <div class="tokens">
                      <span class="muted">{{ t('sessions.tokens5m') }}</span>
                      <strong>{{ tokens(s.tokens_5m) }}</strong>
                    </div>
                    <div class="tokens">
                      <span class="muted">{{ t('sessions.tokens1h') }}</span>
                      <strong>{{ tokens(s.tokens_1h) }}</strong>
                      @if (s.quiet) {
                        <span class="warn">{{ t('sessions.quiet', { ago: since(s) }) }}</span>
                      } @else if (s.last_activity_at) {
                        <span class="muted">{{
                          t('sessions.last', { ago: ago(s.last_activity_at) })
                        }}</span>
                      }
                    </div>
                    <div>
                      @if (s.stoppable || s.run_id !== null) {
                        <baht-button
                          size="sm"
                          [variant]="s.status === 'idle' ? 'ghost' : 'secondary'"
                          [disabled]="busy()"
                          (click)="stop(s)"
                          >{{ t('sessions.stop') }}</baht-button
                        >
                      } @else {
                        <span class="muted">{{ t('sessions.noProcess') }}</span>
                      }
                    </div>
                  </div>
                }
              </div>
            </baht-card>
          }
        }
      } @else {
        <baht-skeleton variant="text"></baht-skeleton>
      }
      <p class="muted">{{ t('sessions.howItKnows') }}</p>
    </div>
  `,
})
export class SessionsComponent {
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t
  protected readonly ago = ago

  protected readonly sessions = signal<LocalSession[] | null>(null)
  protected readonly failed = signal<string | null>(null)
  protected readonly busy = signal(false)
  protected readonly notice = signal<Notice | null>(null)

  protected readonly groups = computed(() => sessionGroups(this.sessions() ?? []))
  protected readonly summary = computed(() => summaryOf(this.sessions() ?? []))

  constructor() {
    void this.load()
    const timer = setInterval(() => {
      // a page in a background tab need not read the machine every few seconds
      if (document.visibilityState === 'visible') void this.load()
    }, REFRESH_MS)
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer)
    })
  }

  private async load(): Promise<void> {
    try {
      this.sessions.set(await firstValueFrom(this.api['local-sessions'].get()))
      this.failed.set(null)
    } catch (error) {
      this.failed.set(describeError(error))
    }
  }

  protected groupLabel(key: 'working' | 'idle'): string {
    return this.t(`sessions.groups.${key}`)
  }
  protected agentLabel(s: LocalSession): string {
    return this.t(`sessions.agent.${s.agent}`)
  }
  protected statusLabel(s: LocalSession): string {
    return this.t(`sessions.status.${s.status}`)
  }
  protected billingLabel(s: LocalSession): string {
    return this.t(`sessions.billing.${s.billing}`)
  }
  protected billingHelp(s: LocalSession): string {
    return this.t(`sessions.billingHelp.${s.billing}`)
  }

  protected tokens(t: LocalSession['tokens_5m']): string {
    const read = t.input + t.cache_read + t.cache_write
    if (t.output === 0 && read === 0) return this.t('sessions.noTokens')
    return `${this.t('sessions.written', { count: compact(t.output) })} · ${this.t('sessions.read', { count: compact(read) })}`
  }

  /** How long a quiet session has written nothing: its last line, else its status. */
  protected since(s: LocalSession): string {
    return ago(s.last_activity_at ?? s.status_since)
  }

  protected async stop(s: LocalSession): Promise<void> {
    const resume = s.agent === 'claude' ? `claude --resume ${s.id}` : `codex resume ${s.id}`
    const sure = await dialog.confirm(this.t('sessions.stopConfirm', { name: s.name, resume }), {
      tone: 'danger',
      confirmText: this.t('sessions.stop'),
    })
    if (!sure) return
    await attemptWithNotice(this.busy, this.notice, async () => {
      const r = await firstValueFrom(
        this.api['local-sessions'].stop.post({ agent: s.agent, id: s.id }),
      )
      await this.load()
      return r.stopped
        ? this.t('sessions.stopped', { name: s.name })
        : this.t('sessions.notStopped', { name: s.name })
    })
  }

  protected async stopWorking(): Promise<void> {
    const going = (this.sessions() ?? []).filter((s) => s.status !== 'idle')
    const names = going.map((s) => `• ${s.name} (${s.cwd})`).join('\n')
    const sure = await dialog.confirm(this.t('sessions.stopWorkingConfirm', { names }), {
      tone: 'danger',
      confirmText: this.t('sessions.stopWorking', { count: going.length }),
    })
    if (!sure) return
    await attemptWithNotice(this.busy, this.notice, async () => {
      const r = await firstValueFrom(this.api['local-sessions']['stop-working'].post())
      await this.load()
      const done = this.t('sessions.stoppedSome', { count: r.stopped.length })
      return r.left.length
        ? `${done} ${this.t('sessions.leftSome', { count: r.left.length })}`
        : done
    })
  }
}

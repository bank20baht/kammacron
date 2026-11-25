import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { AccordionItem, Crumb, TabItem, TimelineItem } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { LiveService } from '../../services/live.service'
import { cost, duration, stamp } from '../../shared/format'
import { RUN_TONE } from '../../shared/tones'

const EVENT_TONE: Record<string, TimelineItem['tone']> = {
  assistant: 'primary',
  tool_use: 'muted',
  tool_result: 'muted',
  system: 'muted',
  result: 'success',
}

/** One run: what went wrong first, then the facts, Claude's summary and every event (live). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, RouterLink],
  selector: 'web-run',
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--baht-space-2);
      align-items: center;
    }
    .strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--baht-space-3);
      padding: var(--baht-space-4);
      border: 1px solid var(--baht-color-border);
      border-radius: var(--baht-radius-lg);
      background: var(--baht-color-surface);
    }
    .strip dt {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
    .strip dd {
      margin: var(--baht-space-1) 0 0;
      font-size: var(--baht-text-lg);
      font-variant-numeric: tabular-nums;
    }
    .denied {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-2);
    }
    .command {
      display: flex;
      align-items: flex-start;
      gap: var(--baht-space-2);
    }
    .command baht-code {
      flex: 1;
      min-width: 0;
    }
  `,
  template: `
    <div class="app-page">
      @if (run().data; as r) {
        <baht-breadcrumbs [items]="crumbs()" (bahtNavigate)="go('/runs')"></baht-breadcrumbs>
        <baht-page-header [heading]="'Run ' + r.id">
          @if (r.status === 'running') {
            <baht-button variant="danger" [loading]="busy()" (click)="stop()">Stop</baht-button>
          }
        </baht-page-header>
        <div class="row">
          <baht-badge
            [tone]="tone[r.status] ?? 'neutral'"
            [label]="r.status"
            [busy]="r.status === 'running' || r.status === 'verifying'"
          ></baht-badge>
          @if (r.error_kind) {
            <baht-badge tone="danger" [label]="r.error_kind"></baht-badge>
          }
          <a [routerLink]="['/review']" [queryParams]="{ card: r.card_id }"
            >Card #{{ r.card_id }}</a
          >
        </div>
        @if (error(); as message) {
          <baht-alert tone="danger" [message]="message"></baht-alert>
        }
        @if (r.error) {
          <baht-alert tone="danger" heading="Error" [message]="r.error"></baht-alert>
        }

        <dl class="strip">
          <div>
            <dt>Duration</dt>
            <dd>{{ took() }}</dd>
          </div>
          <div>
            <dt>Turns</dt>
            <dd>{{ r.num_turns ?? '—' }}</dd>
          </div>
          <div>
            <dt>Cost (API equivalent)</dt>
            <dd>{{ cost(r.cost_usd) }}</dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd class="row">
              {{ r.pushed_to ?? '—' }}
              @if (r.pushed_to) {
                <baht-copy-button [text]="r.pushed_to" label="Copy"></baht-copy-button>
              }
            </dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{{ stamp(r.started_at) }}</dd>
          </div>
        </dl>

        @if (denials().length > 0) {
          <baht-card
            heading="Commands blocked by the allowlist"
            subtitle="What the worker tried and was refused. Allow only what this project needs."
          >
            <div class="denied">
              @for (d of denials(); track $index) {
                <div class="command">
                  <baht-code variant="block" [code]="d"></baht-code>
                  <baht-copy-button [text]="d" label="Copy"></baht-copy-button>
                </div>
              }
              <div class="row">
                <baht-button
                  variant="secondary"
                  icon="settings"
                  (click)="go('/settings/projects/' + r.project_id + '?section=permissions')"
                >
                  Open project permissions
                </baht-button>
              </div>
            </div>
          </baht-card>
        }

        <baht-tabs [tabs]="tabs()" [value]="tab()" (bahtChange)="tab.set($any($event).value)">
          <div data-tab="summary">
            @if (r.summary) {
              <baht-markdown-view [source]="r.summary"></baht-markdown-view>
            } @else {
              <p>No summary yet.</p>
            }
          </div>
          <div data-tab="events">
            <baht-timeline [items]="timeline()"></baht-timeline>
          </div>
          <div data-tab="verify">
            <baht-code variant="block" [code]="r.verify_output ?? ''"></baht-code>
          </div>
        </baht-tabs>

        <baht-accordion [items]="technical()"></baht-accordion>
      } @else if (run().error) {
        <baht-error-state
          heading="This run did not load"
          [message]="'Run ' + id()"
        ></baht-error-state>
      } @else {
        <baht-skeleton variant="text"></baht-skeleton>
      }
    </div>
  `,
})
export class RunComponent {
  private readonly live = inject(LiveService).live
  private readonly api = inject(Api).client.api
  private readonly router = inject(Router)
  readonly id = input.required<string>()
  protected readonly run = liveSignal(() =>
    this.live.subscribe('GET', '/api/runs/:id', { params: { id: this.id() }, query: {} }),
  )
  protected readonly tone = RUN_TONE
  protected readonly cost = cost
  protected readonly stamp = stamp
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)
  protected readonly tab = signal('summary')

  protected readonly crumbs = computed<Crumb[]>(() => [
    { label: 'Runs' }, // no href: `baht-navigate`, so the router moves without a reload
    { label: `Run ${this.id()}` },
  ])

  protected readonly took = computed(() => {
    const r = this.run().data
    return r ? duration(r.started_at, r.ended_at) : '—'
  })

  protected readonly tabs = computed<TabItem[]>(() => {
    const r = this.run().data
    return [
      { key: 'summary', label: 'Summary' },
      { key: 'events', label: 'Events', badge: String(r?.events.length ?? 0) },
      ...(r?.verify_output ? [{ key: 'verify', label: 'Verify output' }] : []),
    ]
  })

  protected readonly technical = computed<AccordionItem[]>(() => {
    const r = this.run().data
    if (!r) return []
    const lines = [
      `Session: ${r.session_id ?? '—'}`,
      `Log: ${r.log_path ?? '—'}`,
      `Commits: ${r.commits.join(', ') || '—'}`,
      ...(r.revert_commit ? [`Reverted in: ${r.revert_commit}`] : []),
      `Base: ${r.base_sha ?? '—'}`,
    ]
    return [{ title: 'Technical details', content: lines.join('\n') }]
  })

  protected readonly denials = computed(() =>
    (
      (this.run().data?.permission_denials as
        { tool_name?: string; tool_input?: { command?: string } }[] | null) ?? []
    ).map((d) => d.tool_input?.command ?? d.tool_name ?? JSON.stringify(d)),
  )

  protected readonly timeline = computed<TimelineItem[]>(() =>
    (this.run().data?.events ?? []).map((e) => ({
      title: e.summary,
      description: e.type,
      time: stamp(e.created_at).slice(11),
      tone: EVENT_TONE[e.type] ?? 'muted',
    })),
  )

  protected go(url: string | undefined): void {
    if (url) void this.router.navigateByUrl(url)
  }

  protected async stop(): Promise<void> {
    this.busy.set(true)
    try {
      await firstValueFrom(this.api.runs({ id: this.id() }).stop.post())
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.busy.set(false)
    }
  }
}

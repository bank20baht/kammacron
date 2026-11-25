import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { FactItem, TimelineItem } from '@20baht/ui'
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

/** One run: its facts, what Claude did (live), what the allowlist refused, and Stop. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-run',
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--baht-space-2);
      align-items: center;
    }
  `,
  template: `
    <div class="app-page">
      @if (run().data; as r) {
        <baht-page-header
          [heading]="'Run ' + r.id"
          [description]="'Card #' + r.card_id"
          back-label="Runs"
          back-href="/runs"
        >
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
        </div>
        @if (error(); as message) {
          <baht-alert tone="danger" [message]="message"></baht-alert>
        }
        <baht-facts [items]="facts()"></baht-facts>
        @if (r.error) {
          <baht-alert tone="danger" heading="Error" [message]="r.error"></baht-alert>
        }
        @if (denials().length > 0) {
          <baht-card
            heading="Refused by the allowlist"
            subtitle="Add what the project needs to its allowed Bash commands"
          >
            @for (d of denials(); track $index) {
              <baht-code [code]="d"></baht-code>
            }
          </baht-card>
        }
        @if (r.summary) {
          <baht-card heading="Claude's summary">
            <baht-markdown-view [source]="r.summary"></baht-markdown-view>
          </baht-card>
        }
        @if (r.verify_output) {
          <baht-card heading="verify_command output">
            <baht-code variant="block" [code]="r.verify_output"></baht-code>
          </baht-card>
        }
        <baht-card heading="Events" [subtitle]="r.events.length + ' so far'">
          <baht-timeline [items]="timeline()"></baht-timeline>
        </baht-card>
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
  readonly id = input.required<string>()
  protected readonly run = liveSignal(() =>
    this.live.subscribe('GET', '/api/runs/:id', { params: { id: this.id() }, query: {} }),
  )
  protected readonly tone = RUN_TONE
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)

  protected readonly facts = computed<FactItem[]>(() => {
    const r = this.run().data
    if (!r) return []
    return [
      { label: 'Started', value: stamp(r.started_at) },
      { label: 'Took', value: duration(r.started_at, r.ended_at) },
      { label: 'Turns', value: r.num_turns ?? '—' },
      { label: 'Cost (API equivalent)', value: cost(r.cost_usd) },
      { label: 'Pushed to', value: r.pushed_to ?? '—', mono: true },
      {
        label: 'Commits',
        value: r.commits.length ? r.commits.map((c) => c.slice(0, 10)) : '—',
        mono: true,
      },
      ...(r.revert_commit
        ? [{ label: 'Reverted in', value: r.revert_commit.slice(0, 10), mono: true }]
        : []),
      { label: 'Session', value: r.session_id ?? '—', mono: true },
      { label: 'Log', value: r.log_path ?? '—', mono: true },
    ]
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

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import type { FieldOption } from '@20baht/ui'

import { I18n } from '../../core/i18n/i18n.service'
import {
  inFilter,
  timelineEvents,
  took,
  type EventFilter,
  type RunEventRow,
  type TimelineEvent,
} from './run-events'

const FILTERS: readonly EventFilter[] = ['all', 'tools', 'messages', 'errors']
/** Rows drawn at first, and added by each "Show earlier": a long run stays a short page. */
const PAGE = 200

/** "02:40:08": the local time of day. */
const clock = (d: Date) =>
  [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')

/**
 * A run's events as a timeline: the time, an icon on a rail, and a card a row: what happened
 * (a tool call shows its command, an edit its lines added and removed, a result whether it
 * worked or the allowlist refused it) and how long the call took. A row opens to show all of it.
 * While the run goes on, the list follows the newest event unless Auto scroll is off. It draws
 * the newest 200 rows; "Show earlier" draws more, and asks for earlier events the page lacks.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-run-timeline',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
      --rail: 2.25rem;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2) var(--baht-space-3);
    }
    .grow {
      flex: 1;
    }
    ol {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 5.5rem var(--rail) minmax(0, 1fr);
      column-gap: var(--baht-space-2);
      position: relative;
    }
    /* the rail: from this row's icon down to the next one's */
    li:not(:last-child)::before {
      content: '';
      position: absolute;
      top: 1.25rem;
      bottom: calc(-1 * var(--baht-space-2));
      left: calc(5.5rem + var(--baht-space-2) + var(--rail) / 2 - 1px);
      width: 2px;
      background: var(--baht-color-border);
    }
    .time {
      align-self: start;
      justify-self: start;
      margin-top: 0.6rem;
      padding: 0.15rem 0.5rem;
      border-radius: var(--baht-radius-full, 999px);
      background: var(--baht-color-surface-muted, var(--baht-color-surface));
      color: var(--baht-color-text-muted);
      font-family: var(--baht-font-mono);
      font-size: var(--baht-text-xs, 0.75rem);
      font-variant-numeric: tabular-nums;
    }
    .dot {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      align-self: start;
      width: var(--rail);
      height: var(--rail);
      margin-top: 0.25rem;
      border: 2px solid var(--tone, var(--baht-color-border));
      border-radius: 50%;
      background: var(--baht-color-bg, var(--baht-color-surface));
      color: var(--tone, var(--baht-color-text-muted));
      --baht-icon-size: 1rem;
    }
    li[data-kind='assistant'],
    li[data-kind='tool_use'] {
      --tone: var(--baht-color-primary);
    }
    li[data-status='success'] {
      --tone: var(--baht-color-success);
    }
    li[data-status='error'],
    li[data-status='denied'] {
      --tone: var(--baht-color-danger);
    }
    .card {
      min-width: 0;
      border: 1px solid var(--baht-color-border);
      border-radius: var(--baht-radius-lg);
      background: var(--baht-color-surface);
    }
    li[data-status='denied'] .card,
    li[data-status='error'] .card {
      border-color: color-mix(in srgb, var(--baht-color-danger) 35%, var(--baht-color-border));
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--baht-space-2);
      padding: var(--baht-space-1) var(--baht-space-3);
    }
    .head > :not(.title) {
      flex: none;
    }
    /* the name gives way (cut with …) before the badges and the time do */
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .title > * + * {
      margin-inline-start: var(--baht-space-2);
    }
    .kind {
      font-weight: 600;
    }
    .sub {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
    .tool {
      font-weight: 500;
    }
    .ms {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
      font-variant-numeric: tabular-nums;
      text-align: end;
    }
    .diff {
      padding: 0 0.4rem;
      border-radius: var(--baht-radius-sm, 4px);
      font-family: var(--baht-font-mono);
      font-size: var(--baht-text-xs, 0.75rem);
    }
    .diff.add {
      background: color-mix(in srgb, var(--baht-color-success) 15%, transparent);
      color: var(--baht-color-success);
    }
    .diff.del {
      background: color-mix(in srgb, var(--baht-color-danger) 15%, transparent);
      color: var(--baht-color-danger);
    }
    .chevron {
      flex: none;
      transition: transform var(--baht-dur-fast, 120ms) var(--baht-ease, ease);
    }
    .open .chevron {
      transform: rotate(180deg);
    }
    .body {
      margin: 0 var(--baht-space-3) var(--baht-space-3);
    }
    pre {
      margin: 0;
      padding: var(--baht-space-2) var(--baht-space-3);
      border-radius: var(--baht-radius);
      font-family: var(--baht-font-mono);
      font-size: var(--baht-text-sm);
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .folded pre {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .folded p {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .open pre {
      max-height: 28rem;
      overflow: auto;
    }
    pre.command {
      background: var(--baht-color-text);
      color: var(--baht-color-text-inverse, var(--baht-color-bg));
    }
    pre.mono {
      background: var(--baht-color-surface-muted, var(--baht-color-bg));
    }
    li[data-status='denied'] pre.mono,
    li[data-status='error'] pre.mono {
      background: color-mix(in srgb, var(--baht-color-danger) 10%, transparent);
    }
    li[data-status='denied'] pre.mono::before,
    li[data-status='error'] pre.mono::before {
      content: 'error: ';
      color: var(--baht-color-danger);
    }
    p {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .empty {
      color: var(--baht-color-text-muted);
    }
    .earlier {
      align-self: center;
    }
    @media (max-width: 40rem) {
      li {
        grid-template-columns: var(--rail) minmax(0, 1fr);
      }
      li:not(:last-child)::before {
        left: calc(var(--rail) / 2 - 1px);
      }
      .time {
        display: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .chevron {
        transition: none;
      }
    }
  `,
  template: `
    <div class="bar">
      <baht-filter
        variant="segmented"
        [multiple]="false"
        [label]="t('run.timeline.filter')"
        [options]="filterOptions()"
        [selected]="[filter()]"
        (bahtChange)="filter.set($event.selected[0] ?? 'all')"
      ></baht-filter>
      <span class="grow"></span>
      <baht-button size="sm" variant="ghost" icon="resize" (click)="toggleAll()">{{
        allOpen() ? t('run.timeline.foldAll') : t('run.timeline.openAll')
      }}</baht-button>
      @if (running()) {
        <baht-filter
          [label]="t('run.timeline.follow')"
          [options]="followOptions()"
          [selected]="follow() ? ['follow'] : []"
          (bahtChange)="follow.set($event.selected.length > 0)"
        ></baht-filter>
      }
    </div>

    @if (hidden() > 0 || earlier()) {
      <baht-button class="earlier" size="sm" variant="secondary" (click)="showEarlier()">{{
        t('run.timeline.earlier')
      }}</baht-button>
    }
    <ol>
      @for (e of drawn(); track e.seq) {
        @let open = isOpen(e);
        <li [attr.data-kind]="e.kind" [attr.data-status]="e.status" [attr.data-seq]="e.seq">
          <time class="time" [attr.datetime]="e.at.toISOString()">{{ clock(e.at) }}</time>
          <span class="dot"><baht-icon [name]="e.icon"></baht-icon></span>
          <div class="card" [class.open]="open" [class.folded]="!open">
            <div class="head">
              <span class="title">
                <span class="kind">{{ e.kind }}</span>
                @if (e.kind === 'system') {
                  <span class="sub">{{ e.tool }}</span>
                } @else if (e.tool) {
                  <span class="sub">•</span>
                  <span class="tool">{{ e.tool }}</span>
                }
              </span>
              @if (e.diff) {
                <span class="diff add">+{{ e.diff.added }}</span>
                <span class="diff del">−{{ e.diff.removed }}</span>
              }
              @if (e.status) {
                <baht-badge
                  [tone]="e.status === 'success' ? 'success' : 'danger'"
                  [label]="statusLabel(e.status)"
                ></baht-badge>
              }
              @if (e.ms !== null) {
                <span class="ms">{{ took(e.ms) }}</span>
              }
              <baht-button
                class="chevron"
                size="sm"
                variant="ghost"
                icon="chevron-down"
                icon-only
                [label]="open ? t('run.timeline.fold') : t('run.timeline.open')"
                [attr.aria-expanded]="open"
                (click)="toggle(e.seq)"
              ></baht-button>
            </div>
            @if (open ? e.full : e.preview; as text) {
              <div class="body">
                @if (e.look === 'text') {
                  <p>{{ text }}</p>
                } @else {
                  <pre [class]="e.look">{{ text }}</pre>
                }
              </div>
            }
          </div>
        </li>
      } @empty {
        <p class="empty">{{ t('run.timeline.empty') }}</p>
      }
    </ol>
  `,
})
export class RunTimelineComponent {
  protected readonly t = inject(I18n).t
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly events = input.required<readonly RunEventRow[]>()
  /** The run goes on: new events come, and the list can follow them. */
  readonly running = input(false)
  /** The run has events earlier than `events`, which the page can ask for. */
  readonly earlier = input(false)
  /** Asked for the page of events before the ones held. */
  readonly loadEarlier = output()

  protected readonly clock = clock
  protected readonly took = took
  protected readonly filter = signal<EventFilter>('all')
  protected readonly follow = signal(true)
  /** Rows opened (or, with `allOpen`, folded) by hand. */
  private readonly flipped = signal<ReadonlySet<number>>(new Set())
  protected readonly allOpen = signal(false)

  protected readonly rows = computed(() => timelineEvents(this.events()))
  protected readonly shown = computed(() => {
    const filter = this.filter()
    return this.rows().filter((e) => inFilter(e, filter))
  })
  /** How many of the newest rows are drawn. */
  private readonly limit = signal(PAGE)
  protected readonly drawn = computed(() => this.shown().slice(-this.limit()))
  protected readonly hidden = computed(() => this.shown().length - this.drawn().length)
  protected readonly filterOptions = computed<(FieldOption & { key: EventFilter })[]>(() =>
    FILTERS.map((key) => ({ key, label: this.t(`run.timeline.filters.${key}`) })),
  )
  protected readonly followOptions = computed<FieldOption[]>(() => [
    { key: 'follow', label: this.t('run.timeline.follow') },
  ])

  constructor() {
    // follow the newest event while the run goes on
    afterRenderEffect(() => {
      const last = this.drawn().at(-1)
      if (!last || !this.running() || !this.follow()) return
      this.host.nativeElement
        .querySelector(`li[data-seq="${String(last.seq)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  protected statusLabel(status: NonNullable<TimelineEvent['status']>): string {
    return this.t(`run.timeline.status.${status}`)
  }

  protected isOpen(e: TimelineEvent): boolean {
    return this.allOpen() !== this.flipped().has(e.seq)
  }

  protected toggle(seq: number): void {
    this.flipped.update((now) => {
      const next = new Set(now)
      if (!next.delete(seq)) next.add(seq)
      return next
    })
  }

  /** Draw a page more; ask for earlier events when the rows held run out. */
  protected showEarlier(): void {
    if (this.hidden() < PAGE && this.earlier()) this.loadEarlier.emit()
    this.limit.update((n) => n + PAGE)
  }

  protected toggleAll(): void {
    this.allOpen.update((open) => !open)
    this.flipped.set(new Set())
  }
}

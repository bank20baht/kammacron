import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'

import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { liveFailed } from '../../shared/live-state'
import { narrowScreen } from '../../shared/narrow'
import { CardDialogComponent } from '../board/card-dialog.component'
import { pickCard } from './pick-card'

/** The width under which the queue and the card take turns instead of sitting side by side. */
const ONE_COLUMN = '(width < 900px)'

/**
 * Every card in review, the queue beside the one chosen: why it is here, and the decision,
 * without leaving the page. Narrow, the two take turns: the queue, then the card picked, with a
 * way back to the queue and on to the next.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IllustrationComponent, BAHT_UI, CardDialogComponent],
  selector: 'web-review',
  styles: `
    .split {
      display: grid;
      grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
      gap: var(--baht-space-4);
      align-items: start;
    }
    @media (width < 900px) {
      .split {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .split.queue-only .detail,
    .split.detail-only .queue {
      display: none;
    }
    .turns {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--baht-space-2);
      margin-block-end: var(--baht-space-3);
    }
    .queue {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-2);
    }
    .item {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-1);
      padding: var(--baht-space-3);
      border: 1px solid var(--baht-color-border);
      border-radius: var(--baht-radius-md);
      background: var(--baht-color-surface);
      cursor: pointer;
      transition:
        border-color 150ms ease,
        background-color 150ms ease,
        transform 160ms var(--app-ease-out);
    }
    .item:focus-visible {
      border-color: var(--baht-color-border-strong);
    }
    @media (hover: hover) and (pointer: fine) {
      .item:hover {
        border-color: var(--baht-color-border-strong);
      }
    }
    .item:active {
      transform: scale(0.98);
    }
    @media (prefers-reduced-motion: reduce) {
      .item:active {
        transform: none;
      }
    }
    .item.selected {
      border-color: var(--baht-color-accent);
      background: var(--baht-color-bg-sunken);
    }
    .item {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    /* the queue is for choosing: three lines of the title and of the reason, the whole of both
       in the card beside it */
    .title,
    .reason {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
    }
    .title {
      font-weight: var(--baht-font-weight-label);
    }
    .muted {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        [heading]="t('review.heading')"
        [description]="cards().data ? t('review.count', { count: count() }) : ''"
      >
        <app-illustration data-slot="art" art="mirror" />
      </baht-page-header>
      @if (cards().data; as all) {
        @if (all.length === 0) {
          <baht-empty-state [message]="t('review.empty')" [hint]="t('review.emptyHint')">
            <app-illustration data-slot="art" art="cloud" />
          </baht-empty-state>
        } @else {
          <div
            class="split"
            [class.queue-only]="oneColumn() && !showingCard()"
            [class.detail-only]="showingCard()"
          >
            <div class="queue" role="listbox" [attr.aria-label]="t('review.queue')">
              @for (card of all; track card.id) {
                <div
                  class="item"
                  role="option"
                  [attr.data-card]="card.id"
                  [attr.tabindex]="card.id === tabStop() ? 0 : -1"
                  [attr.aria-selected]="card.id === selected()"
                  [class.selected]="card.id === selected()"
                  (focus)="active.set(card.id)"
                  (click)="select(card.id)"
                  (keydown)="queueKey($event, all)"
                >
                  <span class="title">#{{ card.id }} {{ card.title }}</span>
                  <span class="muted"
                    >{{ projectName()(card.project_id) }} · {{ ago(card.updated_at) }}</span
                  >
                  <span class="muted reason">{{ card.review_reason ?? t('card.noReason') }}</span>
                </div>
              }
            </div>
            <baht-card class="detail">
              @if (showingCard()) {
                <div class="turns">
                  <baht-button
                    class="back"
                    size="sm"
                    variant="ghost"
                    icon="chevron-left"
                    (click)="backToQueue()"
                    >{{ t('review.backToQueue', { count: all.length }) }}</baht-button
                  >
                  @if (nextOf(all); as next) {
                    <baht-button size="sm" variant="secondary" (click)="select(next)">{{
                      t('review.next')
                    }}</baht-button>
                  }
                </div>
              }
              @if (selected(); as id) {
                <app-card-dialog [cardId]="id" (closed)="backToQueue()"></app-card-dialog>
              }
            </baht-card>
          </div>
        }
      } @else if (failed()) {
        <baht-error-state
          [heading]="t('review.loadError')"
          [message]="t('review.loadErrorHint')"
          [retryLabel]="t('common.retry')"
          (bahtRetry)="retry()"
        ></baht-error-state>
      } @else {
        <baht-skeleton variant="text"></baht-skeleton>
      }
    </div>
  `,
})
export class ReviewComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  /** `?card=12` picks a card; the first one otherwise. */
  readonly card = input<string>()

  /** Bumped by Try again: the queue's subscription is taken anew. */
  private readonly attempt = signal(0)
  protected readonly cards = liveSignal(() => {
    this.attempt()
    return this.live.subscribe('GET', '/api/cards', { query: { status: 'review' } })
  })
  /** No queue yet, and the server answered with an error or the stream is down. */
  protected readonly failed = computed(() => liveFailed(this.cards()))
  private readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  protected readonly ago = ago
  protected readonly count = computed(() => this.cards().data?.length ?? 0)

  /**
   * The card shown: `?card=`, else the first. One that leaves the queue (approved, sent back)
   * gives way to the card that came after it, so a decision moves on down the queue.
   */
  protected readonly selected = linkedSignal<
    { ids: readonly number[]; wanted: number | null },
    number | null
  >({
    source: () => ({
      ids: (this.cards().data ?? []).map((c) => c.id),
      wanted: this.card() ? Number(this.card()) : null,
    }),
    computation: ({ ids, wanted }, previous) =>
      pickCard(ids, wanted, previous && { ids: previous.source.ids, shown: previous.value }),
  })

  /** One column, and a card asked for: it fills the page, the queue a tap away. */
  protected readonly oneColumn = narrowScreen(ONE_COLUMN)
  protected readonly showingCard = computed(
    () => this.oneColumn() && this.card() !== undefined && this.selected() !== null,
  )
  /** The option the keyboard is on; the queue is one Tab stop, the arrows go between its cards. */
  protected readonly active = signal<number | null>(null)
  constructor() {
    // a decision took the card away and the next one came in: its control went with it, so the
    // keyboard starts again near the new card rather than at the top of the page
    let last: number | null = null
    effect(() => {
      const shown = this.selected()
      const moved = last !== null && shown !== null && shown !== last
      last = shown
      if (!moved) return
      // one column: the way back; side by side: the card in the queue, so the arrows go on from it
      this.focusLater(
        this.showingCard() ? '.detail baht-button.back' : `.queue [data-card="${String(shown)}"]`,
        true,
      )
    })
  }

  protected readonly tabStop = computed(() => {
    const ids = (this.cards().data ?? []).map((c) => c.id)
    const active = this.active()
    if (active !== null && ids.includes(active)) return active
    return this.selected() ?? ids[0] ?? null
  })

  protected readonly projectName = computed(() => {
    const names = new Map((this.projects().data ?? []).map((p) => [p.id, p.name]))
    return (id: number) => names.get(id) ?? ''
  })

  protected retry(): void {
    this.attempt.update((n) => n + 1)
  }

  protected select(id: number | null): Promise<boolean> {
    const moved = this.router.navigate([], {
      queryParams: { card: id },
      queryParamsHandling: 'merge',
    })
    // one column: the card takes the page (once the route says so); the keyboard starts at its way back
    if (id !== null && this.oneColumn())
      void moved.then(() => {
        this.focusLater('.detail baht-button.back')
      })
    return moved
  }

  /** Back to the queue (one column), on the card that was open. */
  protected backToQueue(): void {
    const id = this.selected()
    void this.select(null).then(() => {
      if (id !== null) this.focusLater(`.queue [data-card="${String(id)}"]`)
    })
  }

  /** The card after the one shown, to go on with. */
  protected nextOf(all: readonly { id: number }[]): number | null {
    const at = all.findIndex((c) => c.id === this.selected())
    return at >= 0 ? (all[at + 1]?.id ?? null) : null
  }

  /** The listbox's keys: ↑/↓ and Home/End move between cards, Enter or Space opens one. */
  protected queueKey(event: KeyboardEvent, all: readonly { id: number }[]): void {
    const at = all.findIndex((c) => c.id === this.tabStop())
    const to: Record<string, number> = {
      ArrowDown: Math.min(at + 1, all.length - 1),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: all.length - 1,
    }
    if (event.key in to) {
      event.preventDefault()
      const id = all[to[event.key] ?? 0]?.id
      if (id === undefined) return
      this.active.set(id)
      this.focusLater(`.queue [data-card="${String(id)}"]`)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const id = this.tabStop()
      if (id !== null) void this.select(id)
    }
  }

  private readonly host = inject(ElementRef<HTMLElement>)
  private readonly injector = inject(Injector)

  /** Focus what `selector` finds once it is drawn: a `<baht-*>` element, the control inside it. */
  /** `ifLost`: only when nothing has focus once drawn (the control that had it went away). */
  private focusLater(selector: string, ifLost = false): void {
    afterNextRender(
      () => {
        const active = document.activeElement
        if (ifLost && active !== null && active !== document.body) return
        void this.focus(selector)
      },
      { injector: this.injector },
    )
  }

  private async focus(selector: string): Promise<void> {
    const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(selector)
    if (!el) return
    // a Lit element draws its own control a moment after Angular is done
    await (el as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete
    const target = el.tabIndex >= 0 ? el : (el.querySelector<HTMLElement>('button') ?? el)
    target.focus()
  }
}

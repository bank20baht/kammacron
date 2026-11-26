import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'

import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { CardDialogComponent } from '../board/card-dialog.component'

/**
 * Every card in review, the queue beside the one chosen: why it is here, and the decision,
 * without leaving the page.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IllustrationComponent, BAHT_UI, CardDialogComponent],
  selector: 'web-review',
  styles: `
    .split {
      display: grid;
      grid-template-columns: minmax(16rem, 22rem) 1fr;
      gap: var(--baht-space-4);
      align-items: start;
    }
    @media (width < 900px) {
      .split {
        grid-template-columns: 1fr;
      }
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
    }
    .item:hover,
    .item:focus-visible {
      border-color: var(--baht-color-border-strong);
    }
    .item.selected {
      border-color: var(--baht-color-accent);
      background: var(--baht-color-bg-sunken);
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
        [description]="t('review.count', { count: count() })"
      >
        <app-illustration data-slot="art" art="mirror" />
      </baht-page-header>
      @if (cards().data; as all) {
        @if (all.length === 0) {
          <baht-empty-state [message]="t('review.empty')" [hint]="t('review.emptyHint')">
            <app-illustration data-slot="art" art="cloud" />
          </baht-empty-state>
        } @else {
          <div class="split">
            <div class="queue" role="listbox" [attr.aria-label]="t('review.queue')">
              @for (card of all; track card.id) {
                <div
                  class="item"
                  role="option"
                  tabindex="0"
                  [attr.aria-selected]="card.id === selected()"
                  [class.selected]="card.id === selected()"
                  (click)="select(card.id)"
                  (keydown.enter)="select(card.id)"
                >
                  <span class="title">#{{ card.id }} {{ card.title }}</span>
                  <span class="muted"
                    >{{ projectName()(card.project_id) }} · {{ ago(card.updated_at) }}</span
                  >
                  <span class="muted">{{ card.review_reason ?? t('card.noReason') }}</span>
                </div>
              }
            </div>
            <baht-card>
              @if (selected(); as id) {
                <app-card-dialog [cardId]="id" (closed)="select(null)"></app-card-dialog>
              }
            </baht-card>
          </div>
        }
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

  protected readonly cards = liveSignal(() =>
    this.live.subscribe('GET', '/api/cards', { query: { status: 'review' } }),
  )
  private readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  protected readonly ago = ago
  protected readonly count = computed(() => this.cards().data?.length ?? 0)

  protected readonly selected = computed(() => {
    const all = this.cards().data ?? []
    const wanted = Number(this.card())
    return all.find((c) => c.id === wanted)?.id ?? all[0]?.id ?? null
  })

  protected readonly projectName = computed(() => {
    const names = new Map((this.projects().data ?? []).map((p) => [p.id, p.name]))
    return (id: number) => names.get(id) ?? ''
  })

  protected select(id: number | null): void {
    void this.router.navigate([], { queryParams: { card: id }, queryParamsHandling: 'merge' })
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'

import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'

/** Cards in review from every project: why, and the way into each. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-review',
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
    }
    .muted {
      color: var(--baht-color-text-muted);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Review"
        description="Only what the worker could not ship by itself, or asked you to decide."
      ></baht-page-header>
      <div class="list">
        @for (card of cards().data ?? []; track card.id) {
          <baht-card
            [heading]="'#' + card.id + ' ' + card.title"
            [subtitle]="projectName()(card.project_id) + ' · ' + ago(card.updated_at)"
          >
            <p>{{ card.review_reason ?? 'No reason given' }}</p>
            <div class="row">
              @if (card.branch) {
                <baht-code [code]="card.branch"></baht-code>
              }
              @for (tag of card.tags; track tag) {
                <baht-badge tone="mono" [label]="tag"></baht-badge>
              }
              <baht-button variant="primary" size="sm" (click)="openCard(card.id, card.project_id)"
                >Open</baht-button
              >
            </div>
          </baht-card>
        } @empty {
          @if (cards().data) {
            <baht-empty-state
              message="Nothing to review"
              hint="Cards the worker hands back show up here."
            ></baht-empty-state>
          } @else {
            <baht-skeleton variant="text"></baht-skeleton>
          }
        }
      </div>
    </div>
  `,
})
export class ReviewComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly cards = liveSignal(() =>
    this.live.subscribe('GET', '/api/cards', { query: { status: 'review' } }),
  )
  private readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  protected readonly ago = ago

  protected readonly projectName = computed(() => {
    const names = new Map((this.projects().data ?? []).map((p) => [p.id, p]))
    return (id: number) => names.get(id)?.name ?? ''
  })

  protected openCard(id: number, projectId: number): void {
    const slug = (this.projects().data ?? []).find((p) => p.id === projectId)?.slug
    void this.router.navigate(slug ? ['/board', slug] : ['/board'], { queryParams: { card: id } })
  }
}

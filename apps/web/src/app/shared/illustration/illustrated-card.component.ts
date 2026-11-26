import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { BAHT_UI } from '@20baht/angular'

import { IllustrationComponent } from './illustration.component'
import type { Illustration } from './illustration.registry'

/** Editorial composition of a library Card. No interaction, tokens, or state ownership. */
@Component({
  selector: 'app-illustrated-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, IllustrationComponent],
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .panel {
      height: 100%;
    }
    .panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 6rem;
      align-items: center;
      gap: var(--baht-space-3);
      min-height: 6rem;
    }
    .copy {
      min-width: 0;
    }
    app-illustration {
      align-self: center;
      justify-self: end;
      width: 100%;
      max-width: 6rem;
    }
    .metric {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: space-between;
      min-height: 7rem;
    }
    .metric app-illustration {
      align-self: flex-end;
      width: 4rem;
      max-width: 4rem;
    }
    @media (width < 600px) {
      .panel:not(.metric) {
        grid-template-columns: minmax(0, 1fr) 5rem;
        min-height: 0;
      }
      app-illustration {
        width: 100%;
        max-width: 5rem;
      }
    }
  `,
  template: `
    <!-- fill: cards in one grid row as tall as the tallest -->
    <baht-card accent="primary" fill>
      <!-- Application composition: artwork and live content share this layout container. -->
      <div class="panel" [class.metric]="metric()">
        <div class="copy"><ng-content /></div>
        <app-illustration [art]="art()" />
      </div>
    </baht-card>
  `,
})
export class IllustratedCardComponent {
  readonly art = input.required<Illustration>()
  readonly metric = input(false)
}

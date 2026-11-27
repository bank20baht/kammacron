import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'

import { I18n } from '../../core/i18n/i18n.service'
import { type ScenePiece, StickerSceneComponent } from '../../shared/sticker-scene.component'

/** Shown for a URL no route owns. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, StickerSceneComponent],
  selector: 'web-not-found',
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 80dvh;
      padding: var(--baht-space-5);
    }
    baht-card {
      width: min(40rem, 100%);
    }
    web-sticker-scene {
      aspect-ratio: 2.2;
    }
    .text {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--baht-space-2);
      padding: var(--baht-space-5) var(--baht-space-3) var(--baht-space-2);
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: var(--baht-text-2xl);
      line-height: 1.25;
    }
    p {
      margin: 0 0 var(--baht-space-3);
      color: var(--baht-color-text-muted);
    }
  `,
  template: `
    <baht-card>
      <!-- a soi with a street sign and nobody's address: this road goes nowhere -->
      <web-sticker-scene [pieces]="scene"></web-sticker-scene>
      <div class="text">
        <h1>{{ t('notFound.heading') }}</h1>
        <p>{{ t('notFound.message') }}</p>
        <baht-button variant="primary" (click)="home()">{{ t('notFound.home') }}</baht-button>
      </div>
    </baht-card>
  `,
})
export class NotFoundComponent {
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  protected readonly scene: readonly ScenePiece[] = [
    { name: 'power-pole', x: 13, y: 40, size: 22, enter: 0.1 },
    { name: 'street-sign', x: 44, y: 44, size: 38, enter: 0.25 },
    { name: 'tuk-tuk', x: 79, y: 58, size: 33, enter: 0.45 },
    { name: 'motorbike-taxi', x: 25, y: 76, size: 19, enter: 0.6 },
  ]

  protected home(): void {
    void this.router.navigateByUrl('/')
  }
}

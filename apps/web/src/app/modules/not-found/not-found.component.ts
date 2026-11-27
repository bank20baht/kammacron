import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'

import { I18n } from '../../core/i18n/i18n.service'
import {
  type BackdropPiece,
  StickerBackdropComponent,
} from '../../shared/sticker-backdrop.component'
import { BAHT_STICKERS } from '../../shared/stickers'

/** Shown for a URL no route owns. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, BAHT_STICKERS, StickerBackdropComponent],
  selector: 'web-not-found',
  styles: `
    .center {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      min-height: 100dvh;
      box-sizing: border-box;
      padding: var(--baht-space-5);
    }
    baht-card {
      width: min(30rem, 100%);
      border-radius: calc(2 * var(--baht-radius-lg));
      box-shadow: var(--baht-shadow-lift);
    }
    .box {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--baht-space-3);
      padding: var(--baht-space-3);
    }
    /* the heading, with the street sign standing in the card's corner */
    .head {
      display: flex;
      align-self: stretch;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--baht-space-3);
    }
    .head baht-sticker {
      flex: none;
      width: 7rem;
      margin: calc(-1 * var(--baht-space-3)) calc(-1 * var(--baht-space-2)) 0 0;
    }
    h1 {
      margin: var(--baht-space-3) 0 0;
      font-size: calc(1.25 * var(--baht-text-2xl));
      line-height: 1.2;
    }
    p {
      margin: 0 0 var(--baht-space-2);
      color: var(--baht-color-text-muted);
    }
  `,
  template: `
    <!-- behind the card: a soi with a tuk-tuk and a power pole, and nobody's address -->
    <web-sticker-backdrop [pieces]="backdrop"></web-sticker-backdrop>
    <div class="center">
      <baht-card>
        <div class="box">
          <div class="head">
            <h1>{{ t('notFound.heading') }}</h1>
            <baht-sticker
              name="street-sign"
              aria-hidden="true"
              [playOnce]="true"
              [enter]="0.15"
              [replayOnHover]="true"
            ></baht-sticker>
          </div>
          <p>{{ t('notFound.message') }}</p>
          <baht-button variant="primary" (click)="home()">{{ t('notFound.home') }}</baht-button>
        </div>
      </baht-card>
    </div>
  `,
})
export class NotFoundComponent {
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  protected readonly backdrop: readonly BackdropPiece[] = [
    { name: 'power-pole', x: 20, y: 22, size: 11, enter: 0.3 },
    { name: 'cloud', x: 80, y: 18, size: 10, enter: 0.45 },
    { name: 'motorbike-taxi', x: 20, y: 80, size: 9, enter: 0.6 },
    { name: 'tuk-tuk', x: 80, y: 78, size: 14, enter: 0.75 },
  ]

  protected home(): void {
    void this.router.navigateByUrl('/')
  }
}

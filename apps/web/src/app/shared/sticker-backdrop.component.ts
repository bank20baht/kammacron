import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import type { StickerName } from '@20baht/stickers'

import { BAHT_STICKERS } from './stickers'

/** One sticker on the backdrop: where its centre sits (percent of the screen), how wide, when. */
export type BackdropPiece = {
  name: StickerName
  x: number
  y: number
  /** width in rem on a wide screen; a narrow one shrinks it with the screen */
  size: number
  /** seconds after the page shows */
  enter: number
}

/**
 * The page behind a lone card (sign-in, not found): two large soft circles in opposite corners and
 * a few stickers scattered round the card, popping in a beat apart, then still. It fills the
 * screen under the page's content; the card sits on top, so a sticker can tuck behind it on a
 * small screen. Decorative only, hidden from assistive tech.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_STICKERS],
  selector: 'web-sticker-backdrop',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      position: fixed;
      z-index: 0;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    /* the circles: a step darker than the page in light, a step lighter in dark */
    :host::before,
    :host::after {
      position: absolute;
      width: max(26rem, 45vmax);
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--baht-base-300);
      content: '';
    }
    :host::before {
      top: 0;
      left: 0;
      translate: -45% -45%;
    }
    :host::after {
      right: 0;
      bottom: 0;
      translate: 45% 45%;
    }
    baht-sticker {
      position: absolute;
      z-index: 1;
      top: var(--y);
      translate: -50% -50%;
      /* hover replays it */
      pointer-events: auto;
    }
    /* a phone: the card fills the middle, so the stickers keep to the top and bottom edges */
    @media (width < 600px) {
      baht-sticker {
        top: var(--y-narrow);
      }
    }
  `,
  template: `
    @for (p of pieces(); track p.name) {
      <baht-sticker
        [name]="p.name"
        [playOnce]="true"
        [enter]="p.enter"
        [replayOnHover]="true"
        [style.left.%]="p.x"
        [style.--y.%]="p.y"
        [style.--y-narrow.%]="p.y < 50 ? 7 : 93"
        [style.width]="'min(' + p.size + 'rem, ' + p.size * 3 + 'vw)'"
      ></baht-sticker>
    }
  `,
})
export class StickerBackdropComponent {
  readonly pieces = input.required<readonly BackdropPiece[]>()
}

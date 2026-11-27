import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import type { StickerName } from '@20baht/stickers'

import { BAHT_STICKERS } from './stickers'

/** One sticker in a scene: where its centre sits (percent of the stage), how wide, when it pops in. */
export type ScenePiece = {
  name: StickerName
  x: number
  y: number
  /** width, percent of the stage width: the scene scales as one with the screen */
  size: number
  /** seconds after the page shows */
  enter: number
}

/**
 * A small stage of stickers for a page that has nothing else to look at (sign-in, not found): one
 * large sticker and a few small ones around it, each popping in a beat after the one before, then
 * still. Decorative only; the stage is hidden from assistive tech.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_STICKERS],
  selector: 'web-sticker-scene',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      aspect-ratio: 2;
      border-radius: var(--baht-radius-lg);
      /* a sunken stage with a faint dot grid, so the stickers stand on something */
      background:
        radial-gradient(circle, var(--baht-color-border) 1px, transparent 1.5px) 0 0 / 1.25rem
          1.25rem,
        var(--baht-base-200);
    }
    baht-sticker {
      position: absolute;
      translate: -50% -50%;
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
        [style.top.%]="p.y"
        [style.width.%]="p.size"
      ></baht-sticker>
    }
  `,
})
export class StickerSceneComponent {
  readonly pieces = input.required<readonly ScenePiece[]>()
}

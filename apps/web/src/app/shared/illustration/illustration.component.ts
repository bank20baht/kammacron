import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

import { ILLUSTRATIONS, type Illustration } from './illustration.registry'

/** Decorative companion to explicit HTML labels; usable in the library's public art slots. */
@Component({
  selector: 'app-illustration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: block;
      width: 100%;
      max-width: 8rem;
      pointer-events: none;
      user-select: none;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 1;
      object-fit: contain;
    }
  `,
  template: `
    @if (src(); as source) {
      <img [src]="source" alt="" width="384" height="384" loading="lazy" decoding="async" />
    }
  `,
})
export class IllustrationComponent {
  readonly art = input<Illustration | null>(null)
  protected readonly src = computed(() => {
    const art = this.art()
    return art ? ILLUSTRATIONS[art] : null
  })
}

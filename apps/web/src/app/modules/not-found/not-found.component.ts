import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'

import { I18n } from '../../core/i18n/i18n.service'
import { BAHT_STICKERS } from '../../shared/stickers'

/** Shown for a URL no route owns. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, BAHT_STICKERS],
  selector: 'web-not-found',
  styles: `
    :host {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: var(--baht-space-2);
      min-height: 60dvh;
      padding: var(--baht-space-4);
    }
    baht-error-state {
      max-width: 440px;
    }
    baht-sticker {
      width: 7rem;
    }
  `,
  template: `
    <!-- a street sign: this road goes nowhere -->
    <baht-sticker
      name="street-sign"
      aria-hidden="true"
      [playOnce]="true"
      [enter]="0.1"
      [replayOnHover]="true"
    ></baht-sticker>
    <baht-error-state
      icon=""
      [heading]="t('notFound.heading')"
      [message]="t('notFound.message')"
      [retryLabel]="t('notFound.home')"
      (bahtRetry)="home()"
    ></baht-error-state>
  `,
})
export class NotFoundComponent {
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t

  protected home(): void {
    void this.router.navigateByUrl('/')
  }
}

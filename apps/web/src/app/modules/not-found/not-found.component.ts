import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'

import { I18n } from '../../core/i18n/i18n.service'

/** Shown for a URL no route owns. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-not-found',
  styles: `
    :host {
      display: grid;
      place-content: center;
      min-height: 60dvh;
      padding: var(--baht-space-4);
    }
    baht-error-state {
      max-width: 440px;
    }
  `,
  template: `
    <baht-error-state
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

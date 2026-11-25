import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'

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
      heading="Page not found"
      message="Nothing lives at this address."
      retry-label="Go home"
      (bahtRetry)="home()"
    ></baht-error-state>
  `,
})
export class NotFoundComponent {
  private readonly router = inject(Router)

  protected home(): void {
    void this.router.navigateByUrl('/')
  }
}

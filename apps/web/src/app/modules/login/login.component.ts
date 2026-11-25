import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import type { BahtForm } from '@20baht/ui'

import { SessionService } from '../../services/session.service'
import { loginForm } from '../../shared/forms'

/** From another machine (a tunnel): the API token, once, for the session cookie. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-login',
  styles: `
    .center {
      display: grid;
      place-items: center;
      min-height: 70dvh;
      padding: var(--baht-space-5);
    }
    .box {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
      width: min(30rem, 100%);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--baht-space-2);
    }
    .muted {
      margin: 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="center">
      <baht-card
        heading="Open kammacron"
        subtitle="Enter the API token of the machine kammacron runs on."
      >
        <div class="box">
          <p class="muted">On that machine, run:</p>
          <div class="row">
            <baht-code code="kammacron token"></baht-code>
            <baht-copy-button text="kammacron token" label="Copy command"></baht-copy-button>
          </div>
          @if (error()) {
            <baht-alert tone="danger" message="That token is not this install's."></baht-alert>
          }
          <baht-form
            #f="bahtForm"
            [form]="form"
            submit-on-enter
            (bahtSubmit)="submit(f.element)"
          ></baht-form>
          <baht-button variant="primary" block (click)="submit(f.element)">Open</baht-button>
        </div>
      </baht-card>
    </div>
  `,
})
export class LoginComponent {
  private readonly session = inject(SessionService)
  private readonly router = inject(Router)
  readonly next = input<string>()
  protected readonly error = signal(false)
  protected readonly form = loginForm

  protected async submit(form: BahtForm): Promise<void> {
    const token = form.getData()['token']
    if (typeof token === 'string' && (await this.session.login(token.trim()))) {
      // the OAuth consent page is the server's, not a route of this app
      if (this.next()?.startsWith('/oauth/')) globalThis.location.assign(this.next() ?? '/')
      else void this.router.navigateByUrl(this.next() ?? '/board')
    } else this.error.set(true)
  }
}

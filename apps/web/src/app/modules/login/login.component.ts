import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import type { BahtForm } from '@20baht/ui'

import { I18n } from '../../core/i18n/i18n.service'
import { SessionService } from '../../services/session.service'
import { loginForm } from '../../shared/forms'
import { BAHT_STICKERS } from '../../shared/stickers'

/** The API token, once, for the session cookie; or the code `kammacron open` put in the address. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, BAHT_STICKERS],
  selector: 'web-login',
  styles: `
    .center {
      display: grid;
      place-items: center;
      align-content: center;
      gap: var(--baht-space-2);
      min-height: 70dvh;
      padding: var(--baht-space-5);
    }
    baht-sticker {
      width: 6rem;
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
      <!-- the way in: a key, popping in once (a first visit's welcome), still after that -->
      <baht-sticker
        name="key"
        aria-hidden="true"
        [playOnce]="true"
        [enter]="0.15"
        [replayOnHover]="true"
      ></baht-sticker>
      <baht-card [heading]="t('login.heading')" [subtitle]="t('login.subtitle')">
        <div class="box">
          <p class="muted">{{ t('login.run') }}</p>
          <div class="row">
            <baht-code code="kammacron token"></baht-code>
            <baht-copy-button text="kammacron token" [label]="t('login.copy')"></baht-copy-button>
          </div>
          @if (error()) {
            <baht-alert tone="danger" [message]="t('login.wrong')"></baht-alert>
          }
          <baht-form
            #f="bahtForm"
            [form]="form()"
            submit-on-enter
            (bahtSubmit)="submit(f.element)"
          ></baht-form>
          <baht-button variant="primary" block (click)="submit(f.element)">{{
            t('login.open')
          }}</baht-button>
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
  protected readonly t = inject(I18n).t
  protected readonly form = computed(() => loginForm(this.t))

  constructor() {
    const code = new URLSearchParams(globalThis.location.hash.slice(1)).get('code')
    if (code) void this.useCode(code)
  }

  /** The code works once; it leaves the address either way. */
  private async useCode(code: string): Promise<void> {
    globalThis.history.replaceState(null, '', globalThis.location.pathname)
    if (await this.session.loginWithCode(code)) void this.router.navigateByUrl('/board')
  }

  protected async submit(form: BahtForm): Promise<void> {
    const token = form.getData()['token']
    if (typeof token === 'string' && (await this.session.login(token.trim()))) {
      // the OAuth consent page is the server's, not a route of this app
      if (this.next()?.startsWith('/oauth/')) globalThis.location.assign(this.next() ?? '/')
      else void this.router.navigateByUrl(this.next() ?? '/board')
    } else this.error.set(true)
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'

import { I18n } from '../../core/i18n/i18n.service'
import { SessionService } from '../../services/session.service'
import { loginForm } from '../../shared/forms'
import {
  type BackdropPiece,
  StickerBackdropComponent,
} from '../../shared/sticker-backdrop.component'
import { BAHT_STICKERS } from '../../shared/stickers'
import { trimmed, type FormOf } from '../../shared/form-data'

// the elements this component's template draws: they arrive with it (see src/elements.ts)
import '@20baht/ui/components/alert'
import '@20baht/ui/components/card'
import '@20baht/ui/components/code'
import '@20baht/ui/components/copy-button'
import '@20baht/ui/components/form'

/** The API token, once, for the session cookie; or the code `kammacron open` put in the address. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, BAHT_STICKERS, StickerBackdropComponent],
  selector: 'web-login',
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
      width: min(32rem, 100%);
      border-radius: calc(2 * var(--baht-radius-lg));
      box-shadow: var(--baht-shadow-lift);
    }
    .box {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
      padding: var(--baht-space-3);
    }
    /* the heading, with the key sitting in the card's corner */
    .head {
      display: flex;
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
    .row {
      display: flex;
      align-items: center;
      gap: var(--baht-space-2);
    }
    .lead {
      margin: 0;
      color: var(--baht-color-text-muted);
    }
    .muted {
      margin: 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <!-- behind the card: what a key guards, scattered round it, popping in once -->
    <web-sticker-backdrop [pieces]="backdrop"></web-sticker-backdrop>
    <div class="center">
      <baht-card>
        <div class="box">
          <div class="head">
            <h1>{{ t('login.heading') }}</h1>
            <baht-sticker
              name="key"
              aria-hidden="true"
              [playOnce]="true"
              [enter]="0.15"
              [replayOnHover]="true"
            ></baht-sticker>
          </div>
          <p class="lead">{{ t('login.subtitle') }}</p>
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
            (bahtSubmit)="submit(f)"
          ></baht-form>
          <baht-button variant="primary" block (click)="submit(f)">{{
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
  protected readonly backdrop: readonly BackdropPiece[] = [
    { name: 'shield', x: 20, y: 20, size: 11, enter: 0.3 },
    { name: 'lock-screen', x: 80, y: 22, size: 9, enter: 0.45 },
    { name: 'potted-plant', x: 19, y: 80, size: 8.5, enter: 0.6 },
    { name: 'password', x: 81, y: 80, size: 11, enter: 0.75 },
  ]

  constructor() {
    const code = new URLSearchParams(globalThis.location.hash.slice(1)).get('code')
    if (code) void this.useCode(code)
  }

  /** The code works once; it leaves the address either way. */
  private async useCode(code: string): Promise<void> {
    globalThis.history.replaceState(null, '', globalThis.location.pathname)
    if (await this.session.loginWithCode(code)) void this.router.navigateByUrl('/board')
  }

  protected async submit(form: FormOf<typeof loginForm>): Promise<void> {
    const token = trimmed(form.getData().token)
    if (token && (await this.session.login(token))) {
      // the OAuth consent page is the server's, not a route of this app
      if (this.next()?.startsWith('/oauth/')) globalThis.location.assign(this.next() ?? '/')
      else void this.router.navigateByUrl(this.next() ?? '/board')
    } else this.error.set(true)
  }
}

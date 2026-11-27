import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import type { BahtForm } from '@20baht/ui'

import { I18n } from '../../core/i18n/i18n.service'
import { SessionService } from '../../services/session.service'
import { loginForm } from '../../shared/forms'
import { type ScenePiece, StickerSceneComponent } from '../../shared/sticker-scene.component'

/** The API token, once, for the session cookie; or the code `kammacron open` put in the address. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, StickerSceneComponent],
  selector: 'web-login',
  styles: `
    .center {
      display: grid;
      place-items: center;
      min-height: 80dvh;
      padding: var(--baht-space-5);
    }
    baht-card {
      width: min(58rem, 100%);
    }
    /* the scene beside the form on a wide screen, above it on a narrow one */
    .split {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--baht-space-5);
    }
    web-sticker-scene {
      aspect-ratio: 5 / 4;
    }
    @media (width >= 760px) {
      .split {
        grid-template-columns: 1fr 1fr;
        align-items: stretch;
      }
      web-sticker-scene {
        aspect-ratio: auto;
        min-height: 22rem;
      }
    }
    h1 {
      margin: 0;
      font-size: var(--baht-text-2xl);
      line-height: 1.25;
    }
    .box {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--baht-space-3);
      padding-block: var(--baht-space-2);
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
      <baht-card>
        <div class="split">
          <!-- the way in: a key with what it guards around it, popping in once, still after that -->
          <web-sticker-scene [pieces]="scene"></web-sticker-scene>
          <div class="box">
            <h1>{{ t('login.heading') }}</h1>
            <p class="muted">{{ t('login.subtitle') }}</p>
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
  protected readonly scene: readonly ScenePiece[] = [
    { name: 'shield', x: 22, y: 28, size: 30, enter: 0.1 },
    { name: 'password', x: 76, y: 24, size: 28, enter: 0.25 },
    { name: 'key', x: 48, y: 58, size: 52, enter: 0.4 },
    { name: 'potted-plant', x: 82, y: 80, size: 24, enter: 0.55 },
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

  protected async submit(form: BahtForm): Promise<void> {
    const token = form.getData()['token']
    if (typeof token === 'string' && (await this.session.login(token.trim()))) {
      // the OAuth consent page is the server's, not a route of this app
      if (this.next()?.startsWith('/oauth/')) globalThis.location.assign(this.next() ?? '/')
      else void this.router.navigateByUrl(this.next() ?? '/board')
    } else this.error.set(true)
  }
}

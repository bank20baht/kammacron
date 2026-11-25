import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterOutlet } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { filter, map } from 'rxjs'
import { liveSignal } from '@20baht/angular/live'

import { I18n } from './core/i18n/i18n.service'
import { currentKey, navWith } from './core/navigation/navigation'
import { LiveService } from './services/live.service'
import { SessionService } from './services/session.service'
import { StatusBarComponent } from './shared/status-bar.component'

/** The frame every page sits in: brand, the navigator, the page. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, BAHT_UI, StatusBarComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router)
  protected readonly session = inject(SessionService)
  private readonly t = inject(I18n).t

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  )

  private readonly live = inject(LiveService).live
  private readonly open = computed(() => this.session.state() === 'open')
  private readonly status = liveSignal(() =>
    this.open() ? this.live.subscribe('GET', '/api/status') : null,
  )
  private readonly projects = liveSignal(() =>
    this.open() ? this.live.subscribe('GET', '/api/projects', { query: {} }) : null,
  )

  /** No navigator before the session exists (the token page). */
  protected readonly items = computed(() =>
    this.open() ? navWith(this.t, this.status().data?.review ?? 0, this.projects().data ?? []) : [],
  )

  protected readonly current = computed(() =>
    currentKey(
      this.url(),
      this.items().map((item) => item.key),
    ),
  )

  /** Route in place instead of letting the link reload the page. */
  protected navigate(event: Event): void {
    const { href } = (event as CustomEvent<{ href: string | undefined }>).detail
    if (href === undefined) return
    event.preventDefault()
    void this.router.navigateByUrl(href)
  }
}

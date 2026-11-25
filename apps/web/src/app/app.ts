import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterOutlet } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { filter, map } from 'rxjs'
import { NAV, currentKey } from './core/navigation/navigation'

/** The frame every page sits in: brand, the navigator, the page. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, BAHT_UI],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router)

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  )

  protected readonly items = NAV

  protected readonly current = computed(() =>
    currentKey(
      this.url(),
      NAV.map((item) => item.key),
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

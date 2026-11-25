import { Injectable } from '@angular/core'
import { liveClient, typedLive } from '@20baht/live/browser'
import type { App } from '@kammacron/kit'

/** The page's one live stream (`POST /live`), typed by the server's routes. */
@Injectable({ providedIn: 'root' })
export class LiveService {
  readonly live = typedLive<App>(liveClient({ url: '/live' }))

  constructor() {
    // A page put in the back/forward cache keeps its open fetch, and the browser allows six
    // connections per host: after six such pages every new request waits. So the stream ends with
    // the page, and a page brought back from the cache loads again for a fresh one.
    globalThis.addEventListener('pagehide', () => {
      this.live.close()
    })
    globalThis.addEventListener('pageshow', (event: PageTransitionEvent) => {
      if (event.persisted) globalThis.location.reload()
    })
  }
}

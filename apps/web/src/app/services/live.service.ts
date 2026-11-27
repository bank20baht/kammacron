import { inject, Injectable } from '@angular/core'
import { liveClient, typedLive } from '@20baht/live/browser'
import type { App } from '@kammacron/kit'

import { SessionService } from './session.service'

/**
 * The page's one live stream (`POST /live`), typed by the server's routes. The client closes it
 * when the page is put away and opens it again when the page comes back from the bfcache. When
 * the server refuses the stream's cookie, the session is over: the token page, not a silent retry.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly session = inject(SessionService)
  readonly live = typedLive<App>(
    liveClient({
      url: '/live',
      onUnauthorized: () => {
        this.session.expired()
      },
    }),
  )
}

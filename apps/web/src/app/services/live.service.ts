import { Injectable } from '@angular/core'
import { liveClient, typedLive } from '@20baht/live/browser'
import type { App } from '@kammacron/kit'

/**
 * The page's one live stream (`POST /live`), typed by the server's routes. The client closes it
 * when the page is put away and opens it again when the page comes back from the bfcache.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  readonly live = typedLive<App>(liveClient({ url: '/live' }))
}

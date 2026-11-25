import { Injectable, InjectionToken, inject } from '@angular/core'
import { createEden } from '@20baht/ngx-eden'
import type { App } from 'server'

/**
 * Where the API lives: always the page's own origin. kammacron serves the web app itself, and in
 * dev `ng serve` proxies `/api`, `/live`, `/files` and `/mcp` to it (`apps/web/proxy.conf.json`),
 * so the session cookie (SameSite=Strict) and the Host/Origin checks see one origin.
 */
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => globalThis.location.origin,
})

/**
 * The typed client of the Elysia server: `inject(Api).client.api.hello.get()`.
 * Types come from `apps/server/dist/types` (`bun run --filter server build:types`).
 */
@Injectable({ providedIn: 'root' })
export class Api {
  readonly client = createEden<App>({ baseUrl: inject(API_BASE) })
}

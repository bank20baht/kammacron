import { Injectable, InjectionToken, inject, isDevMode } from '@angular/core'
import { createEden } from '@20baht/ngx-eden'
import type { App } from 'server'

/**
 * Where the API lives. In dev the Angular servers run on :4200 and up and Elysia on :3001;
 * deployed, one web server serves the apps and proxies `/api` on the same origin.
 */
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => (isDevMode() ? 'http://localhost:3001' : globalThis.location.origin),
})

/**
 * The typed client of the Elysia server: `inject(Api).client.api.hello.get()`.
 * Types come from `apps/server/dist/types` (`bun run --filter server build:types`).
 */
@Injectable({ providedIn: 'root' })
export class Api {
  readonly client = createEden<App>({ baseUrl: inject(API_BASE) })
}

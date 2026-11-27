import { inject, Injectable, signal } from '@angular/core'
import { Router } from '@angular/router'

const NEEDS_TOKEN = 'needs-token'

export type SessionState = 'unknown' | 'open' | typeof NEEDS_TOKEN

/**
 * The web session: `GET /api/session` says whether the cookie is there; one is opened with the API
 * token, or with the one-time code of `kammacron open` (`POST /api/session`).
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly state = signal<SessionState>('unknown')
  private readonly router = inject(Router)

  /**
   * The server refused the cookie (the token was rotated, or the session ran out) while a page was
   * open: the token page, and back to where the person was once they are in again.
   */
  expired(): void {
    if (this.state() === NEEDS_TOKEN) return
    this.state.set(NEEDS_TOKEN)
    const next = this.router.url
    if (!next.startsWith('/login')) void this.router.navigate(['/login'], { queryParams: { next } })
  }

  async ensure(): Promise<SessionState> {
    if (this.state() === 'open') return 'open'
    const response = await fetch('/api/session', { credentials: 'same-origin' })
    this.state.set(response.ok ? 'open' : NEEDS_TOKEN)
    return this.state()
  }

  login(token: string): Promise<boolean> {
    return this.open({ token })
  }

  loginWithCode(code: string): Promise<boolean> {
    return this.open({ code })
  }

  private async open(credential: { token: string } | { code: string }): Promise<boolean> {
    const response = await fetch('/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credential),
    })
    this.state.set(response.ok ? 'open' : NEEDS_TOKEN)
    return response.ok
  }
}

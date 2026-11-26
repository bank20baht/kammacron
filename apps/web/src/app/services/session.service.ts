import { Injectable, signal } from '@angular/core'

export type SessionState = 'unknown' | 'open' | 'needs-token'

/**
 * The web session: `GET /api/session` says whether the cookie is there; one is opened with the API
 * token, or with the one-time code of `kammacron open` (`POST /api/session`).
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly state = signal<SessionState>('unknown')

  async ensure(): Promise<SessionState> {
    if (this.state() === 'open') return 'open'
    const response = await fetch('/api/session', { credentials: 'same-origin' })
    this.state.set(response.ok ? 'open' : 'needs-token')
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
    this.state.set(response.ok ? 'open' : 'needs-token')
    return response.ok
  }
}

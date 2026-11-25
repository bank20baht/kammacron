import { Injectable, signal } from '@angular/core'

export type SessionState = 'unknown' | 'open' | 'needs-token'

/**
 * The web session: a browser on this machine gets the cookie by asking (`GET /api/session`);
 * through a tunnel the API token is entered once (`POST /api/session`).
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

  async login(token: string): Promise<boolean> {
    const response = await fetch('/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    this.state.set(response.ok ? 'open' : 'needs-token')
    return response.ok
  }
}

import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'

import { SessionService } from '../services/session.service'

/** Every page but /login needs the session; without one, the token page. */
export const sessionGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService)
  const router = inject(Router)
  if ((await session.ensure()) === 'open') return true
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } })
}

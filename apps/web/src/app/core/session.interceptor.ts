import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { tap } from 'rxjs'

import { SessionService } from '../services/session.service'

/** A 401 from the API on a page that was open: the session is over, and the person is told where. */
export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionService)
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) session.expired()
      },
    }),
  )
}

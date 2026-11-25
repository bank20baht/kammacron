import type { ApplicationConfig } from '@angular/core'
import { provideBrowserGlobalErrorListeners } from '@angular/core'
import { provideHttpClient } from '@angular/common/http'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { routes } from './app.routes'

/** The router and the `HttpClient` the kit's typed API client (`Api`) sends through. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
  ],
}

import type { ApplicationConfig } from '@angular/core'
import { provideBrowserGlobalErrorListeners } from '@angular/core'
import { provideHttpClient } from '@angular/common/http'
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router'

import { I18nTitle } from './core/i18n/i18n-title'
import { routes } from './app.routes'

/** The router (its tab titles in the locale's words) and the `HttpClient` the kit's typed API client (`Api`) sends through. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    { provide: TitleStrategy, useClass: I18nTitle },
  ],
}

import type { ApplicationConfig } from '@angular/core'
import { provideBrowserGlobalErrorListeners } from '@angular/core'
import { provideHttpClient } from '@angular/common/http'
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withRouterConfig,
} from '@angular/router'

import { I18nTitle } from './core/i18n/i18n-title'
import { routes } from './app.routes'

/** The router (its tab titles in the locale's words) and the `HttpClient` the kit's typed API client (`Api`) sends through. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `computed`: a Back the draft guard stops puts the history back where it was, not one short
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ canceledNavigationResolution: 'computed' }),
    ),
    provideHttpClient(),
    { provide: TitleStrategy, useClass: I18nTitle },
  ],
}

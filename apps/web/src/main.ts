import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './app/app'
import { appConfig } from './app/app.config'

// Registers the <baht-*> custom elements in their own chunk; they upgrade in place once it lands.
void import('@20baht/ui')

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  console.error(err)
})

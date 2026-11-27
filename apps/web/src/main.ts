import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './app/app'
import { appConfig } from './app/app.config'

// Registers the shell's <baht-*> elements in a chunk of their own; they upgrade in place once it
// lands. A page's elements come with the page (see elements.ts).
void import('./elements')

// The service worker makes it installable (a Dock or taskbar app) and says how to start the
// server when it is down; it caches nothing. Browsers give it only on localhost or https.
if ('serviceWorker' in navigator)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  console.error(err)
})

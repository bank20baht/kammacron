/*
 * The <baht-*> elements the shell draws on every page (app.html and the status band), each
 * registering itself. Every other element is imported by the component that draws it, so it
 * arrives in that page's chunk: `bahtui/registered-element` with `perComponent`
 * (eslint.config.ts) fails on a tag a template draws that neither this file nor the component's
 * own file imports. `<baht-form>` brings the elements of its field types itself.
 */
import '@20baht/ui/components/app-shell'
import '@20baht/ui/components/badge'
import '@20baht/ui/components/button'
import '@20baht/ui/components/notification-bell'
import '@20baht/ui/components/theme-toggle'
import '@20baht/ui/components/toast'

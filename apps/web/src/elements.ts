/*
 * The <baht-*> elements this app puts on a page, each registering itself; not the whole library
 * ('@20baht/ui' defines all of them, the dashboard's charts included). A tag used in a template
 * gets a line here or in `elements-later.ts`, or it stays an empty unknown element.
 * `<baht-form>` brings the elements of its field types itself. `bahtui/registered-element`
 * (eslint.config.ts) fails on a tag a template draws that neither file brings.
 *
 * This file is what the shell and the board draw: the first screen waits for it. The rest
 * (charts, the calendar, the wizards' workflow, the run page's code blocks) is in
 * `elements-later.ts`, which main.ts asks for once this one has landed; an element drawn before
 * its code arrives upgrades in place.
 */
import '@20baht/ui/components/alert'
import '@20baht/ui/components/app-shell'
import '@20baht/ui/components/badge'
import '@20baht/ui/components/button'
import '@20baht/ui/components/card'
import '@20baht/ui/components/choice-group'
import '@20baht/ui/components/comments'
import '@20baht/ui/components/copy-button'
import '@20baht/ui/components/empty-state'
import '@20baht/ui/components/form'
import '@20baht/ui/components/form-modal'
import '@20baht/ui/components/icon'
import '@20baht/ui/components/image-preview'
import '@20baht/ui/components/markdown-view'
import '@20baht/ui/components/menu'
import '@20baht/ui/components/modal'
import '@20baht/ui/components/notification-bell'
import '@20baht/ui/components/page-header'
import '@20baht/ui/components/save-bar'
import '@20baht/ui/components/segmented-nav'
import '@20baht/ui/components/skeleton'
import '@20baht/ui/components/split-button'
import '@20baht/ui/components/tabs'
import '@20baht/ui/components/theme-toggle'
import '@20baht/ui/components/toast'

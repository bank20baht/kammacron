/*
 * The <baht-*> elements this app puts on a page, each registering itself; not the whole library
 * ('@20baht/ui' defines all of them, the dashboard's charts included). A tag used in a template
 * gets a line here, or it stays an empty unknown element.
 *
 * `<baht-form>` registers the elements of its field types itself, all but two: a `schedule` field
 * (the cron wizard's When) needs `schedule` here, a `cron` field `cron` (LIB_GAP.md).
 */
import '@20baht/ui/components/accordion'
import '@20baht/ui/components/alert'
import '@20baht/ui/components/app-shell'
import '@20baht/ui/components/badge'
import '@20baht/ui/components/bar-chart'
import '@20baht/ui/components/breadcrumbs'
import '@20baht/ui/components/button'
import '@20baht/ui/components/calendar'
import '@20baht/ui/components/card'
import '@20baht/ui/components/choice-group'
import '@20baht/ui/components/code'
import '@20baht/ui/components/comments'
import '@20baht/ui/components/copy-button'
import '@20baht/ui/components/empty-state'
import '@20baht/ui/components/error-state'
import '@20baht/ui/components/filter'
import '@20baht/ui/components/form'
import '@20baht/ui/components/form-modal'
import '@20baht/ui/components/icon'
import '@20baht/ui/components/image-preview'
import '@20baht/ui/components/line-chart'
import '@20baht/ui/components/markdown-view'
import '@20baht/ui/components/menu'
import '@20baht/ui/components/meter'
import '@20baht/ui/components/modal'
import '@20baht/ui/components/notification-bell'
import '@20baht/ui/components/page-header'
import '@20baht/ui/components/save-bar'
import '@20baht/ui/components/schedule'

import '@20baht/ui/components/search'
import '@20baht/ui/components/section-header'
import '@20baht/ui/components/segmented-nav'
import '@20baht/ui/components/skeleton'
import '@20baht/ui/components/split-button'
import '@20baht/ui/components/stat'
import '@20baht/ui/components/table'
import '@20baht/ui/components/tabs'
import '@20baht/ui/components/theme-toggle'
import '@20baht/ui/components/toast'
import '@20baht/ui/components/workflow'

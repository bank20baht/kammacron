import '@20baht/stickers/element'
import { registerSticker } from '@20baht/stickers'
import { cron } from '@20baht/stickers/icons/cron'
import { kanban } from '@20baht/stickers/icons/kanban'
import { key } from '@20baht/stickers/icons/key'
import { streetSign } from '@20baht/stickers/icons/street-sign'
import { terminal } from '@20baht/stickers/icons/terminal'

/*
 * The few animated stickers the app shows, registered by name for `<baht-sticker name="…">`.
 * Imported by the pages that use one, so a page without stickers loads none of this.
 *
 * Where they go (DESIGN.md, Stickers): only where a page has no illustration of its own and is
 * seen rarely or is empty for now; each pops in once and rests on its still frame. Under reduced
 * motion the library shows the still frame from the start. No sticker that draws in the `hot`
 * (danger red) slot goes beside a neutral message: red means failed here.
 */
for (const icon of [cron, kanban, key, streetSign, terminal]) registerSticker(icon)

export { BAHT_STICKERS } from '@20baht/angular/stickers'

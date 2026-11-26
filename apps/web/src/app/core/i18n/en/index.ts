import { board } from './board'
import { calendar } from './calendar'
import { card } from './card'
import { common } from './common'
import { forms } from './forms'
import { kanban } from './kanban'
import { project } from './project'
import { review } from './review'
import { run } from './run'
import { runs } from './runs'
import { settings } from './settings'
import { login, nav, notFound, statusBar, titles } from './shell'
import { stats } from './stats'
import { status } from './status'
import { welcome } from './welcome'

/**
 * English: the source catalog, one file per page. Its shape is what every other language must
 * have (`ShapeOf<typeof en>`); a key is `section.name`, e.g. `board.newCard`.
 */
export const en = {
  identity: {
    worker: 'The digital workshop',
    philosophy: 'You plan. It runs on time. You decide.',
  },
  common,
  nav,
  titles,
  statusBar,
  notFound,
  login,
  status,
  forms,
  board,
  card,
  review,
  kanban,
  runs,
  run,
  stats,
  calendar,
  settings,
  project,
  welcome,
} as const

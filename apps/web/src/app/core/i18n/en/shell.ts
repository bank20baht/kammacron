/** The frame: navigator, page titles, the status band, the not-found and login pages. */
export const nav = {
  board: 'Board',
  review: 'Review',
  cron: 'Cron jobs',
  runs: 'Runs',
  calendar: 'Calendar',
  stats: 'Stats',
  settings: 'Settings',
  projects: 'Projects',
  groups: {
    kanban: 'Kanban',
    cron: 'Cron',
    system: 'System',
  },
} as const

/** The browser tab: `{page} · kammacron`. */
export const titles = {
  suffix: '{page} · kammacron',
  open: 'Open',
  board: 'Board',
  review: 'Review',
  cron: 'Cron jobs',
  runs: 'Runs',
  run: 'Run',
  calendar: 'Calendar',
  stats: 'Stats',
  settings: 'Settings',
  project: 'Project',
  welcome: 'Welcome',
  notFound: 'Not found',
} as const

export const statusBar = {
  paused: 'Worker: paused',
  idle: 'Worker: idle',
  projectPaused: '{name} paused',
  review: 'Review {count}',
  pause: 'Pause',
  resume: 'Resume',
  alerts: 'Alerts',
  noAlerts: 'Nothing needs you',
  level: { error: 'error', warning: 'warning', info: 'info' },
} as const

export const notFound = {
  heading: 'Page not found',
  message: 'Nothing lives at this address.',
  home: 'Go home',
} as const

export const login = {
  heading: 'Open kammacron',
  subtitle: 'Enter the API token of the machine kammacron runs on.',
  run: 'The link `kammacron start` prints, or `kammacron open`, signs you in. Or paste the token; for it, run:',
  copy: 'Copy command',
  wrong: 'That token is not this install’s.',
  open: 'Open',
} as const

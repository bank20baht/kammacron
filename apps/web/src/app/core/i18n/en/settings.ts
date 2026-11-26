/** The settings page: the install's tabs, the status side card, and the language. */
export const settings = {
  heading: 'Settings',
  description: 'One person, one machine: the worker and its projects.',
  tabs: {
    projects: 'Projects',
    mcp: 'MCP',
    worker: 'Worker',
    access: 'Access & notifications',
    machine: 'This machine',
  },
  projects: {
    heading: 'Projects',
    description: 'Each with a directory is worked through its playbook',
    empty: 'No project yet',
    add: 'Add project',
    columns: { name: 'Name', slug: 'Slug', worker: 'Worker', checked: 'Last checked' },
    every: 'every {minutes} min',
    paused: 'paused',
    boardOnly: 'board only',
    notYet: 'not yet',
  },
  mcp: {
    connect: 'Connect Claude Code',
    connectSubtitle: 'Optional: adds this board as an MCP server',
    rotate: 'Rotate token',
  },
  worker: {
    heading: 'Worker',
    paused: 'Paused',
    on: 'On',
    resume: 'Resume',
    pauseAll: 'Pause everything',
  },
  access: { heading: 'Access and notifications' },
  machine: {
    heading: 'This machine',
    notFound: 'not found on the worker PATH',
    noWorker: 'This process runs without the worker (--no-worker).',
  },
  language: { heading: 'Language', form: 'Language', label: 'Language' },
  languages: { en: 'English' },
  status: {
    workerPaused: 'Worker paused',
    workerOn: 'Worker on',
    pausedHint: 'No new runs start until you resume.',
    onHint: 'Ready for the next pickable card.',
  },
  messages: {
    saved: 'Saved',
    rotated:
      'New token: update every `claude mcp add` that used the old one, and reconnect OAuth clients',
  },
} as const

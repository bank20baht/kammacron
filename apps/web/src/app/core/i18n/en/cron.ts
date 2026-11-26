/** The Cron jobs page: a project's jobs and the form that adds one. */
export const cron = {
  heading: 'Cron jobs',
  description:
    'Run Claude or Codex with your own prompt, a command, or a playbook, on a timer. Pick a project, then add a job below.',
  project: 'Project',
  listHeading: 'Jobs of this project',
  addHeading: 'Add a cron job',
  asAgent: 'as {agent}',
  on: 'On',
  off: 'Off',
  noProject: 'No project yet',
  noProjectHelp: 'A cron job runs in a project’s directory. Add a project first.',
  addProject: 'Add a project',
  limits: {
    claude: 'Claude',
    codex: 'Codex',
    hours: '{n} hours',
    days: '{n} days',
    minutes: '{n} minutes',
    resets: 'Starts over {when}',
    asOfRun: 'as of run {run}, {when}',
    asOf: 'as of {when}',
    none: {
      claude: 'No numbers yet: Claude reports them on its next run here.',
      codex: 'No numbers yet: Codex keeps them once it has run on this machine.',
    },
  },
} as const

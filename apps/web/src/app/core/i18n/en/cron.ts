/** The Cron jobs page: a project's jobs and the form that adds one. */
export const cron = {
  heading: 'Cron jobs',
  description:
    'Run Claude or Codex with your own prompt, a command, or a playbook, on a timer. Pick a project, then add a job below.',
  project: 'Project',
  listHeading: 'Jobs of this project',
  listHeadingOf: 'Jobs of {name}',
  addHeading: 'Add a cron job',
  asAgent: 'as {agent}',
  on: 'On',
  off: 'Off',
  noProject: 'No project yet',
  noProjectHelp: 'A cron job runs in a project’s directory. Add a project first.',
  addProject: 'Add a project',
  loadError: 'The projects did not load',
  jobsLoadError: 'The cron jobs did not load',
  loadErrorHint: 'The server could not be reached. Try again when it is back.',
  add: 'Add cron job',
  edit: 'Edit',
  editNamed: 'Edit {name}',
  wizard: {
    heading: 'New cron job',
    editHeading: 'Edit cron job',
    save: 'Save changes',
    inProject: 'In {name}',
    keepInterval: 'Now runs every {minutes} min. Leave this empty to keep that, or pick a time.',
    saved: 'Cron job “{name}” saved',
    steps: { what: 'What', task: 'The task', when: 'When' },
    /** The first jobs the new-project wizard offers. */
    templates: {
      bugs: {
        label: 'Find bugs every morning',
        description: 'Files a card for each bug; fixes nothing',
        prompt:
          'Read the code of this project and look for bugs. For each one, file an auto-pilot card: the file and line, what goes wrong and how to see it. Do not fix anything, and do not file a bug that already has a card.',
      },
      fix: {
        label: 'Fix cards one at a time',
        description: 'Takes one auto-pilot card each time and does it',
        prompt:
          'Take one auto-pilot card, do it, and commit. Write on the card what you did. If it needs a person, move it to Review and say why.',
      },
      deps: {
        label: 'Update dependencies weekly',
        description: 'Updates, tests, commits when the tests pass',
        prompt:
          'Update the dependencies of this project to their newest compatible versions and run the tests. Commit when they pass; when they fail, put things back and file an auto-pilot card with what broke.',
      },
    },
    runs: 'Who does it',
    more: 'More options: model and agent',
    namePlaceholder: 'Find bugs every morning',
    nameHelp: 'Shown in the list and on the calendar',
    added: 'Cron job “{name}” added',
    seeJobs: 'See cron jobs',
  },
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

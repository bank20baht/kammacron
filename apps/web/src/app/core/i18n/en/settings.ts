/** The settings page: the install's tabs, the status side card, and the language. */
export const settings = {
  heading: 'Settings',
  description: 'One person, one machine: the worker and its projects.',
  tabs: {
    projects: 'Projects',
    mcp: 'MCP',
    worker: 'Worker',
    access: 'Access & notifications',
    data: 'Data',
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
    wizard: {
      systemError: 'Could not check this machine',
      systemErrorHint: 'The wizard needs to know which agents are installed. Try again.',
      heading: 'New project',
      steps: { folder: 'Folder', access: 'What agents may do', start: 'First job' },
      folderHelp:
        'The repository on this machine. Runs happen there, as it is: kammacron does not branch, reset or push it',
      nameHelp: 'Filled in from the folder; change it if you like',
      bashHelp:
        'Reading and editing files here and git (add, commit, push…) are always allowed. Add the commands its work needs, such as the tests',
      first: 'Start with a cron job',
      firstHelp:
        'It runs Claude (or Codex) on a timer; change or turn it off on the Cron jobs page',
      notNow: 'Not now',
      notNowHelp: 'Add one later',
      create: 'Create project',
      created: 'Project “{name}” created',
    },
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
  data: {
    heading: 'How long data is kept',
    description:
      'The daily housekeeping lets go of what is past its length. Projects, cron jobs, playbooks and settings are never removed on their own: only you remove them.',
    kinds: {
      run_log_retention_days: {
        label: 'Run logs',
        help: 'Each run’s timeline and its raw log file',
      },
      step_output_retention_days: {
        label: 'Step output',
        help: 'The end of what each step printed',
      },
      run_retention_days: {
        label: 'Runs',
        help: 'The runs themselves: status, time, cost and summary (what Stats counts)',
      },
      done_card_archive_days: {
        label: 'Archive done cards after',
        help: 'Off the board; still there, and can be brought back',
      },
      archived_card_retention_days: {
        label: 'Remove archived cards after',
        help: 'With their comments and attachments; their runs stay',
      },
      alert_retention_days: { label: 'Read alerts', help: 'Alerts you have read' },
    },
    days: '{n} days',
    year: '1 year',
    never: 'Keep until I remove it',
    count: '{n} now',
    size: '{n} now · {size} on disk',
    due: '{n} would go at the next housekeeping',
    save: 'Save',
    discard: 'Discard changes',
    clean: 'Clean now',
    unsaved: 'Save or discard the changed lengths first: Clean now goes by the saved ones.',
    confirmTitle: 'Clean now?',
    confirmMessage: 'This lets go now of what the saved lengths have passed.',
    confirmNothing: 'Nothing is past the saved lengths right now.',
    willRemove: 'Removed for good:',
    willArchive: 'Archived (can be brought back):',
    cleaned: 'Cleaned: {list}',
    nothing: 'Nothing was past its length',
  },
  messages: {
    saved: 'Saved',
    rotated:
      'New token: update every `claude mcp add` that used the old one, and reconnect OAuth clients',
  },
} as const

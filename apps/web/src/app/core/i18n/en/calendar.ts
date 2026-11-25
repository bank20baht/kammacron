/** The calendar page: what runs on its own and when, and the jobs on a timer. */
export const calendar = {
  heading: 'Calendar',
  description:
    'What runs on its own and when: worker rounds, schedules and housekeeping ahead (dashed), the runs that happened (solid).',
  show: 'Show',
  project: 'Project',
  layer: {
    worker: 'Worker rounds',
    schedule: 'Schedules',
    housekeeping: 'Housekeeping',
    runs: 'Runs',
  },
  loadFailed: 'The calendar did not load. Try again in a moment.',
  label: 'Cron calendar',
  jobs: 'Jobs',
  jobsSubtitle: 'Everything on a timer, and why a job that is off is off',
  noJobs: 'No jobs',
  column: {
    job: 'Job',
    project: 'Project',
    every: 'Runs',
    next: 'Next',
    last: 'Last',
    result: 'Last result',
    state: 'State',
  },
  job: { worker: 'Worker round', housekeeping: 'Housekeeping' },
  jobWithCommand: '{name} ({command})',
  frequentTitle: '{name} · {every}',
  runMeta: '{project} · run {id} · {status}',
  on: 'on',
  off: 'off: {reason}',
  every: {
    minutes: { one: 'every minute', other: 'every {count} min' },
    hours: { one: 'hourly', other: 'every {count} h' },
    days: { one: 'daily', other: 'every {count} days' },
  },
} as const

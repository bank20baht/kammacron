/** The runs page: every run, searched, filtered and paged. */
export const runs = {
  heading: 'Runs',
  description: 'Every run of a playbook, newest first. Open one to watch it live or stop it.',
  searchPlaceholder: 'Search cards, summaries or errors',
  searchLabel: 'Search runs',
  status: 'Status',
  project: 'Project',
  empty: 'No runs match',
  column: {
    id: 'Run',
    card: 'Card',
    status: 'Status',
    started: 'Started',
    took: 'Duration',
    turns: 'Turns',
    cost: 'Cost (API equivalent)',
  },
} as const

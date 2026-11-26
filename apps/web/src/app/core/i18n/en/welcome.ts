/** The first-start page: what is on the PATH, and a first project. */
export const welcome = {
  heading: 'Welcome to kammacron',
  description: 'Add a project directory, then give it something to run on a schedule.',
  tools: {
    heading: 'Tools',
    subtitle: 'On the PATH the worker uses. Install what your commands need.',
    notFound: 'not found',
  },
  project: {
    heading: 'Project',
    subtitle: 'Settings → Projects: add one, set its directory, turn the worker on',
    linked: 'linked',
    noneYet: 'none yet',
    edit: 'Edit',
    add: 'Add a project',
  },
  goBoard: 'Go to the board',
} as const

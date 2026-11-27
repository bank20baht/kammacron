/** The sessions page: every Claude Code and Codex session open on this machine. */
export const sessions = {
  heading: 'Sessions',
  description:
    'Every Claude Code and Codex session open on this machine, whoever started it: which are spending tokens now, which sit idle, and which look stuck.',
  summary: {
    working: { one: '{count} working', other: '{count} working' },
    shell: { one: '{count} in a command', other: '{count} in a command' },
    idle: { one: '{count} idle', other: '{count} idle' },
    quiet: { one: '{count} may be stuck', other: '{count} may be stuck' },
  },
  stopWorking: { one: 'Stop the one working', other: 'Stop the {count} working' },
  stopWorkingConfirm:
    'End these sessions now? Each conversation is kept: `claude --resume` or `codex resume` takes it up again.\n\n{names}',
  stoppedSome: { one: 'Stopped {count} session.', other: 'Stopped {count} sessions.' },
  leftSome: { one: '{count} did not stop.', other: '{count} did not stop.' },
  stop: 'Stop',
  stopConfirm: 'End "{name}" now? The conversation is kept: `{resume}` takes it up again.',
  stopped: 'Stopped "{name}".',
  notStopped: '"{name}" did not stop.',
  groups: {
    working: 'Working now',
    idle: 'Idle',
  },
  status: {
    working: 'Working',
    shell: 'In a command',
    idle: 'Idle',
  },
  quiet: 'Nothing written for {ago}: may be stuck',
  billing: {
    subscription: 'Subscription',
    api: 'API key',
    cloud: 'Cloud provider',
    unknown: 'Unknown',
  },
  billingHelp: {
    subscription: "Counts against the plan's usage limits",
    api: 'Billed by the token to an API key',
    cloud: 'Billed by Bedrock, Vertex or Foundry',
    unknown: 'Could not tell',
  },
  agent: { claude: 'Claude', codex: 'Codex' },
  run: 'kammacron run #{id}',
  tokens5m: 'Last 5 min',
  tokens1h: 'Last hour',
  written: '{count} written',
  read: '{count} read',
  noTokens: 'none',
  last: 'Last written {ago}',
  idleFor: 'Idle since {ago}',
  noProcess: 'The desktop app: stop it there',
  empty: 'No Claude Code or Codex session is open on this machine.',
  noneWorking: 'Nothing is working: no tokens are being spent.',
  loadFailed: 'Could not read the sessions',
  howItKnows:
    'Read from what Claude Code and Codex keep on disk (~/.claude, ~/.codex) and from the process list, every few seconds. Stop ends the process; nothing is sent to the agent first.',
} as const

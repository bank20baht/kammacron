/** What a schedule runs: a shell command, a coding agent with a prompt, or one of the project's playbooks. */
export const SCHEDULE_KINDS = ['claude', 'codex', 'command', 'playbook'] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/** A schedule as `GET /projects/:id/schedules` lists it, as far as its line needs. */
type ScheduleLike = {
  command: string | null
  playbook: string | null
  agent: string | null
  prompt: string | null
}

/** What a schedule runs, in one short line: its command, `playbook:<name>`, or `codex: <prompt>`. */
export const runsWhat = (s: ScheduleLike): string => {
  if (s.agent) {
    const first = (s.prompt ?? '').trim().split('\n')[0] ?? ''
    return `${s.agent}: ${first.length > 80 ? `${first.slice(0, 79)}…` : first}`
  }
  return s.command ?? `playbook:${s.playbook ?? ''}`
}

/** What names a run: the card a worker round ran (`#12 title`), or the cron job that started it. */
export const runLabel = (run: {
  card_id: number | null
  card_title: string | null
  schedule_name?: string | null
}): string =>
  run.card_id === null
    ? (run.schedule_name ?? '')
    : `#${String(run.card_id)} ${run.card_title ?? ''}`

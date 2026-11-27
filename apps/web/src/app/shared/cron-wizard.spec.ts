import { t } from '../core/i18n/i18n.service'
import { CRON_STEPS, cronEditStart, cronJobPatch, cronWizard, type CronJob } from './cron-wizard'
import { MODEL_OTHER } from './forms'

const job = (over: Partial<CronJob> = {}): CronJob => ({
  id: 7,
  project_id: 2,
  name: 'Find bugs',
  command: null,
  playbook: null,
  agent: 'claude',
  prompt: 'Look for bugs',
  use_board: true,
  model: null,
  claude_agent: null,
  cron: '0 9 * * 1-5',
  interval_minutes: 30,
  card_tags: [],
  ...over,
})

const options = {
  claude: { agents: [], models: [{ id: 'claude-opus-5-5', label: 'Opus', description: '' }] },
  codex: { models: [] },
}

/** The data as the steps hold it, with `change` applied to one step. */
const edited = (
  start: ReturnType<typeof cronEditStart>,
  step: keyof typeof CRON_STEPS,
  change: Record<string, unknown>,
) => ({ ...start, [CRON_STEPS[step]]: { ...start[CRON_STEPS[step]], ...change } })

describe('editing a cron job', () => {
  it('starts from the job as it is', () => {
    const start = cronEditStart(job({ model: 'claude-opus-5-5' }), options)
    expect(start[CRON_STEPS.what]).toMatchObject({
      project_id: '2',
      name: 'Find bugs',
      runs: 'claude',
    })
    expect(start[CRON_STEPS.task]).toMatchObject({
      prompt: 'Look for bugs',
      more: true,
      model_claude: 'claude-opus-5-5',
    })
    expect(start[CRON_STEPS.when]).toEqual({ when: '0 9 * * 1-5' })
    // a model the list does not have is kept, typed in
    expect(cronEditStart(job({ model: 'my-model' }), options)[CRON_STEPS.task]).toMatchObject({
      model_claude: MODEL_OTHER,
      model_other: 'my-model',
    })
  })

  it('sends nothing when nothing changed', () => {
    const start = cronEditStart(job({ model: 'my-model' }), options)
    expect(cronJobPatch(start, start)).toEqual({})
  })

  it('sends only what changed', () => {
    const start = cronEditStart(job(), options)
    expect(cronJobPatch(start, edited(start, 'task', { prompt: 'Fix one card' }))).toEqual({
      prompt: 'Fix one card',
    })
    expect(cronJobPatch(start, edited(start, 'when', { when: '0 18 * * *' }))).toEqual({
      cron: '0 18 * * *',
    })
  })

  it('keeps an interval job on its interval unless a time is picked', () => {
    const interval = job({ cron: null, interval_minutes: 45 })
    const start = cronEditStart(interval, options)
    expect(start[CRON_STEPS.when]).toEqual({ when: '' })
    expect(cronJobPatch(start, edited(start, 'what', { name: 'Renamed' }))).toEqual({
      name: 'Renamed',
    })
    expect(cronJobPatch(start, edited(start, 'when', { when: '0 9 * * *' }))).toEqual({
      cron: '0 9 * * *',
    })
    // its When may stay empty; a new job's may not
    const when = (interval: number | null) =>
      cronWizard(t, { projects: null, options, playbooks: [], interval }).forms[2]?.fields[0]
    expect(when(45)?.required).toBeFalsy()
    expect(when(null)?.required).toBe(true)
  })

  it('clears what the old kind ran when the kind changes', () => {
    const start = cronEditStart(job({ model: 'claude-opus-5-5' }), options)
    const data = {
      ...edited(start, 'what', { runs: 'command' }),
      [CRON_STEPS.task]: { ...start[CRON_STEPS.task], command: 'bun test', card_tags: ['ci'] },
    }
    expect(cronJobPatch(start, data)).toMatchObject({
      agent: null,
      prompt: null,
      model: null,
      claude_agent: null,
      playbook: null,
      command: 'bun test',
      card_tags: ['ci'],
    })
  })
})

import { t } from '../core/i18n/i18n.service'
import { cronJobBody, cronWizard } from './cron-wizard'
import { scheduleKinds, type AgentOptions } from './forms'
import { runsWhat } from './schedule'

describe('schedule', () => {
  it('says what a schedule runs in one line', () => {
    const base = { command: null, playbook: null, agent: null, prompt: null }
    expect(runsWhat({ ...base, command: 'bun test' })).toBe('bun test')
    expect(runsWhat({ ...base, playbook: 'deploy' })).toBe('playbook:deploy')
    expect(runsWhat({ ...base, agent: 'codex', prompt: 'Take one card\nthen more' })).toBe(
      'codex: Take one card',
    )
  })

  it('offers Claude and Codex only when this machine has them', () => {
    const models = [{ id: 'm', label: 'M', description: '' }]
    const both: AgentOptions = { claude: { agents: [], models }, codex: { models } }
    expect(scheduleKinds(both)).toEqual(['claude', 'codex', 'command', 'playbook'])
    expect(scheduleKinds({ claude: null, codex: { models } })).toEqual([
      'codex',
      'command',
      'playbook',
    ])
    expect(scheduleKinds({ claude: null, codex: null })).toEqual(['command', 'playbook'])
  })

  it("folds Claude's agent and model away, and offers them only when there are some", () => {
    const models = [{ id: 'haiku', label: 'Haiku', description: '' }]
    const wizard = (agents: { name: string; description: string; source: 'project' }[]) =>
      cronWizard(t, {
        projects: null,
        playbooks: [],
        options: { claude: { agents, models }, codex: null },
      })
    const keys = (w: ReturnType<typeof wizard>, form: number) =>
      w.forms[form]?.fields.map((f) => f.key) ?? []
    const none = wizard([])
    expect(none.forms.map((f) => f.form_name)).toEqual(['What', 'The task', 'When'])
    expect(keys(none, 0)).toEqual(['name', 'runs'])
    expect(keys(none, 2)).toEqual(['when'])
    expect(keys(none, 1)).not.toContain('claude_agent')
    expect(keys(none, 1)).toContain('model_claude')
    expect(keys(none, 1)).not.toContain('model_codex')
    const one = wizard([{ name: 'rev', description: 'Reviews', source: 'project' }])
    expect(keys(one, 1)).toContain('claude_agent')
    // folded until "More options" is on
    expect(one.rules.find((r) => r.id === 'agent')?.when).toMatchObject({
      and: [{ field: 'The task.more', op: 'eq', value: true }, {}],
    })
  })

  it('asks for the project only when there is more than one', () => {
    const two = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]
    const keys = cronWizard(t, {
      projects: two,
      playbooks: [],
      options: null,
    }).forms[0]?.fields.map((f) => f.key)
    expect(keys).toEqual(['project_id', 'name', 'runs'])
  })

  it('turns the steps into the API body, with the model only when asked', () => {
    const data = {
      What: { project_id: '2', name: 'Find bugs', runs: 'claude' },
      'The task': {
        prompt: 'Find bugs\nthen file cards',
        use_board: true,
        more: false,
        model_claude: 'haiku',
      },
      When: { when: '0 9 * * 1-5' },
    }
    expect(cronJobBody(t, data, null)).toEqual({
      project: '2',
      body: {
        name: 'Find bugs',
        cron: '0 9 * * 1-5',
        agent: 'claude',
        prompt: 'Find bugs\nthen file cards',
        use_board: true,
        model: null,
        claude_agent: null,
      },
    })
    const more = { ...data, 'The task': { ...data['The task'], more: true } }
    expect(cronJobBody(t, more, '7')).toMatchObject({ project: '7', body: { model: 'haiku' } })
  })
})

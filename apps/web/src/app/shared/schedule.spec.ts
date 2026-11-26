import { t } from '../core/i18n/i18n.service'
import { scheduleForm, scheduleKinds, type AgentOptions } from './forms'
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

  it("asks for Claude's agent only when the project has one, and the model from the CLI's list", () => {
    const models = [{ id: 'haiku', label: 'Haiku', description: '' }]
    const keys = (agents: { name: string; description: string; source: 'project' }[]) =>
      scheduleForm(t, {
        kind: 'claude',
        playbooks: [],
        options: { claude: { agents, models }, codex: null },
        otherModel: false,
      }).fields.map((f) => f.key)
    expect(keys([])).not.toContain('claude_agent')
    expect(keys([{ name: 'rev', description: 'Reviews', source: 'project' }])).toContain(
      'claude_agent',
    )
    const model = scheduleForm(t, {
      kind: 'claude',
      playbooks: [],
      options: { claude: { agents: [], models }, codex: null },
      otherModel: true,
    }).fields
    expect(model.find((f) => f.key === 'model')).toMatchObject({ type: 'radio' })
    expect(model.some((f) => f.key === 'model_other')).toBe(true)
  })
})

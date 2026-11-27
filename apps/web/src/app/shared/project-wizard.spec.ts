import { t } from '../core/i18n/i18n.service'
import { NOT_NOW, firstJob, folderName, projectBody, projectWizard, slugOf } from './project-wizard'

describe('project wizard', () => {
  it('names a project from its folder, and a slug from its name', () => {
    expect(folderName('/Users/me/code/my-app/')).toBe('my-app')
    expect(slugOf('Baan Kanom')).toBe('baan-kanom')
    expect(slugOf('บ้านขนม')).toBe('project')
  })

  it('offers a first job only when an agent is there', () => {
    expect(projectWizard(t, true).forms.map((f) => f.form_name)).toEqual([
      'Folder',
      'What agents may do',
      'First job',
    ])
    expect(projectWizard(t, false).forms).toHaveLength(2)
  })

  it('turns the steps into the project, and the job a template makes', () => {
    const data = {
      Folder: { repo_path: '/code/shop', name: '' },
      'What agents may do': { mode: 'autopilot', allowed_bash: ['Bash(bun test:*)'] },
      'First job': { first: 'bugs' },
    }
    expect(projectBody(t, data)).toEqual({
      project: {
        slug: 'shop',
        name: 'shop',
        repo_path: '/code/shop',
        mode: 'autopilot',
        allowed_bash: ['Bash(bun test:*)'],
        web_tools: false,
      },
      first: 'bugs',
    })
    expect(projectBody(t, { ...data, 'First job': { first: NOT_NOW } }).first).toBeNull()
    expect(firstJob(t, 'bugs', 'codex')).toMatchObject({ agent: 'codex', cron: '0 9 * * 1-5' })
  })
})

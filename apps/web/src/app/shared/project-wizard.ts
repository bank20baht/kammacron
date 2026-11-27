import type { FieldDescriptor, WorkflowDefinition } from '@20baht/ui'

import type { Translate } from '../core/i18n/i18n.service'
import { TEMPLATES, templateValues, type TemplateKey } from './cron-wizard'

/*
 * A new project in three short steps, in a modal (Settings, the welcome page, an empty Cron jobs
 * page): its folder and name, what its agents may do, and a first cron job to start it off. One
 * `<baht-workflow>`; on submit the page creates the project, then the job.
 */

/** The first job's own "nothing": no cron job yet. */
export const NOT_NOW = 'none'

export const projectSteps = (t: Translate) => ({
  folder: t('settings.projects.wizard.steps.folder'),
  access: t('settings.projects.wizard.steps.access'),
  start: t('settings.projects.wizard.steps.start'),
})

export const projectWizard = (
  t: Translate,
  /** Claude or Codex is on this machine: a first job can be offered. */
  agents: boolean,
): WorkflowDefinition => {
  const s = projectSteps(t)
  const folder: FieldDescriptor[] = [
    {
      order: 1,
      type: 'text',
      key: 'repo_path',
      label: t('forms.project.repoPath'),
      placeholder: '/Users/me/code/my-app',
      help: t('settings.projects.wizard.folderHelp'),
      required: true,
    },
    {
      order: 2,
      type: 'text',
      key: 'name',
      label: t('forms.project.projectName'),
      help: t('settings.projects.wizard.nameHelp'),
      required: true,
    },
  ]
  const access: FieldDescriptor[] = [
    {
      order: 1,
      type: 'radio',
      variant: 'card',
      key: 'mode',
      label: t('forms.project.mode'),
      value: 'watch',
      options: [
        {
          key: 'watch',
          label: t('forms.project.modeWatch'),
          description: t('forms.project.modeWatchHelp'),
          icon: 'search',
        },
        {
          key: 'autopilot',
          label: t('forms.project.modeAutopilot'),
          description: t('forms.project.modeAutopilotHelp'),
          icon: 'sparkles',
        },
      ],
    },
    {
      order: 2,
      type: 'tags',
      key: 'allowed_bash',
      label: t('forms.project.allowedBash'),
      placeholder: 'Bash(bun run test:*)',
      help: t('settings.projects.wizard.bashHelp'),
    },
    { order: 3, type: 'toggle', key: 'web_tools', label: t('forms.project.webTools') },
  ]
  const start: FieldDescriptor[] = [
    {
      order: 1,
      type: 'radio',
      variant: 'card',
      key: 'first',
      label: t('settings.projects.wizard.first'),
      help: t('settings.projects.wizard.firstHelp'),
      value: NOT_NOW,
      options: [
        ...TEMPLATES.map((key) => ({
          key,
          label: t(`cron.wizard.templates.${key}.label`),
          description: t(`cron.wizard.templates.${key}.description`),
        })),
        {
          key: NOT_NOW,
          label: t('settings.projects.wizard.notNow'),
          description: t('settings.projects.wizard.notNowHelp'),
        },
      ],
    },
  ]
  return {
    workflow_id: 'new-project',
    forms: [
      { form_id: 'project-folder', form_name: s.folder, order: 1, fields: folder },
      { form_id: 'project-access', form_name: s.access, order: 2, fields: access },
      // without an agent there is no job to offer: the last step goes
      ...(agents
        ? [{ form_id: 'project-start', form_name: s.start, order: 3, fields: start }]
        : []),
    ],
    rules: [],
  }
}

/** The folder's last part, as a name: `/Users/me/code/my-app/` → `my-app`. */
export const folderName = (path: string): string =>
  path.trim().replace(/\/+$/, '').split('/').pop() ?? ''

/** A slug from a name: lower case, words joined by `-`. */
export const slugOf = (name: string): string =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project'

type Data = Record<string, Record<string, unknown> | undefined>

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The project as `POST /projects` takes it, and the first job's template, if one was picked. */
export const projectBody = (t: Translate, data: Data) => {
  const s = projectSteps(t)
  const folder = data[s.folder] ?? {}
  const access = data[s.access] ?? {}
  const first = data[s.start]?.['first']
  const name = text(folder['name']) ?? folderName(text(folder['repo_path']) ?? '')
  const tags = access['allowed_bash']
  return {
    project: {
      slug: slugOf(name),
      name,
      repo_path: text(folder['repo_path']),
      mode: access['mode'] === 'autopilot' ? ('autopilot' as const) : ('watch' as const),
      allowed_bash: Array.isArray(tags) ? (tags as string[]) : [],
      web_tools: access['web_tools'] === true,
    },
    first: (TEMPLATES as readonly unknown[]).includes(first) ? (first as TemplateKey) : null,
  }
}

/** The first job a template makes, for the agent this machine has. */
export const firstJob = (t: Translate, key: TemplateKey, agent: 'claude' | 'codex') => {
  const v = templateValues(t, key)
  return {
    name: v.name,
    cron: v.when,
    agent,
    prompt: v.prompt,
    use_board: v.use_board,
    model: null,
    claude_agent: null,
  }
}

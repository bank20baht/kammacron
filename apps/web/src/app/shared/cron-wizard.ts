import type { Condition, FieldDescriptor, Rule, WorkflowDefinition } from '@20baht/ui'

import type { Translate } from '../core/i18n/i18n.service'
import { MODEL_DEFAULT, MODEL_OTHER, NO_AGENT, scheduleKinds, type AgentOptions } from './forms'
import { SCHEDULE_KINDS, type ScheduleKind } from './schedule'

/*
 * A new cron job as three short steps, in a modal (from the board's New ▾, the Cron jobs page and a
 * project's settings): what (the project, a template, what runs it), the task (the prompt, a
 * command or a playbook; the model and agent folded away) and when (the time, and a name the app
 * fills in). One `<baht-workflow>`: its rules show each step only the fields of what was picked.
 */

/** The icons of what a job runs. */
const KIND_ICONS: Record<ScheduleKind, string> = {
  claude: 'sparkles',
  codex: 'code',
  command: 'terminal',
  playbook: 'layers',
}

const AGENT_ICONS = { project: 'folder', user: 'users', plugin: 'layers' } as const

/** Radio cards while they fit a row or two; past that, a dropdown. */
const CARD_LIMIT = 6

/** Choices as radio cards, or as a dropdown when there are too many for cards. */
const choice = (
  base: {
    order: number
    key: string
    label: string
    help?: string
    required?: boolean
    value?: string
  },
  options: { key: string; label: string; description?: string; icon?: string }[],
): FieldDescriptor =>
  options.length <= CARD_LIMIT
    ? { ...base, type: 'radio', variant: 'card', options }
    : {
        ...base,
        type: 'dropdown',
        options: options.map(({ key, label, description }) => ({
          key,
          label: description ? `${label}: ${description}` : label,
        })),
      }

/** A job ready to use: what it runs, what it is told, when, and its name. */
export const TEMPLATES = ['bugs', 'fix', 'deps'] as const
export type TemplateKey = (typeof TEMPLATES)[number]
/** The template field's own "nothing": start from an empty form. */
export const BLANK = 'blank'

const TEMPLATE_CRON: Record<TemplateKey, string> = {
  bugs: '0 9 * * 1-5', // weekdays at 09:00
  fix: '*/30 * * * *', // every 30 minutes
  deps: '0 10 * * 1', // Mondays at 10:00
}
const TEMPLATE_ICONS: Record<TemplateKey, string> = {
  bugs: 'search',
  fix: 'check',
  deps: 'refresh',
}

/** What a template fills in. */
export const templateValues = (t: Translate, key: TemplateKey) => ({
  prompt: t(`cron.wizard.templates.${key}.prompt`),
  use_board: true,
  when: TEMPLATE_CRON[key],
  name: t(`cron.wizard.templates.${key}.label`),
})

/** The step names: the form names the rules and the data are keyed by. */
export const cronSteps = (t: Translate) => ({
  what: t('cron.wizard.steps.what'),
  task: t('cron.wizard.steps.task'),
  when: t('cron.wizard.steps.when'),
})

export type CronWizardInput = {
  /** The projects to pick from; null when the job's project is already known. */
  projects: readonly { id: number; name: string }[] | null
  options: AgentOptions | null
  playbooks: readonly string[]
}

/** A Model field of one CLI: its default, its models, or another typed in. */
const modelField = (
  t: Translate,
  kind: 'claude' | 'codex',
  models: readonly { id: string; label: string; description: string }[],
) =>
  // a field the rules hide goes back to its `value`: Default, not nothing, when it opens again
  choice(
    { order: 5, key: `model_${kind}`, label: t('forms.schedule.model'), value: MODEL_DEFAULT },
    [
      {
        key: MODEL_DEFAULT,
        label: t('forms.schedule.modelDefault'),
        description: t(`forms.schedule.modelDefaultHelp.${kind}`),
      },
      ...models.map((m) => ({ key: m.id, label: m.label, description: m.description })),
      {
        key: MODEL_OTHER,
        label: t('forms.schedule.modelOtherCard'),
        description: t('forms.schedule.modelOtherHelp'),
      },
    ],
  )

/** Shows the fields while `when` holds, hides them otherwise. */
const showWhen = (id: string, when: Condition, form: string, fields: string[]): Rule => ({
  id,
  when,
  then: fields.map((field) => ({ action: 'show' as const, target: { form, field } })),
  else: fields.map((field) => ({ action: 'hide' as const, target: { form, field } })),
})

export const cronWizard = (t: Translate, c: CronWizardInput): WorkflowDefinition => {
  const s = cronSteps(t)
  const kinds = scheduleKinds(c.options)
  const agentKinds = kinds.filter((k) => k === 'claude' || k === 'codex')
  const agents = c.options?.claude?.agents ?? []
  const claudeModels = c.options?.claude?.models ?? []
  const codexModels = c.options?.codex?.models ?? []

  const what: FieldDescriptor[] = [
    ...(c.projects && c.projects.length > 1
      ? [
          {
            order: 1,
            type: 'dropdown' as const,
            key: 'project_id',
            label: t('forms.newCard.project'),
            required: true,
            options: c.projects.map((p) => ({ key: String(p.id), label: p.name })),
          },
        ]
      : []),
    // the templates are an agent's: without Claude or Codex there is nothing to fill in
    ...(agentKinds.length
      ? [
          {
            order: 2,
            type: 'radio' as const,
            variant: 'card' as const,
            key: 'template',
            label: t('cron.wizard.template'),
            help: t('cron.wizard.templateHelp'),
            options: [
              ...TEMPLATES.map((key) => ({
                key,
                label: t(`cron.wizard.templates.${key}.label`),
                description: t(`cron.wizard.templates.${key}.description`),
                icon: TEMPLATE_ICONS[key],
              })),
              {
                key: BLANK,
                label: t('cron.wizard.blank'),
                description: t('cron.wizard.blankHelp'),
                icon: 'pencil',
              },
            ],
          },
        ]
      : []),
    {
      order: 3,
      type: 'radio',
      variant: 'card',
      key: 'runs',
      label: t('cron.wizard.runs'),
      required: true,
      options: kinds.map((key) => ({
        key,
        label: t(`project.schedules.kind.${key}`),
        description: t(`forms.schedule.kindHelp.${key}`),
        icon: KIND_ICONS[key],
      })),
    },
  ]

  const task: FieldDescriptor[] = [
    {
      order: 1,
      type: 'textarea',
      key: 'prompt',
      label: t('forms.schedule.prompt'),
      placeholder: t('forms.schedule.promptPlaceholder'),
      help: t('forms.schedule.promptHelp'),
      required: true,
    },
    {
      order: 2,
      type: 'checkbox',
      key: 'use_board',
      value: true,
      label: t('forms.schedule.useBoard'),
      help: t('forms.schedule.useBoardHelp'),
    },
    { order: 3, type: 'toggle', key: 'more', value: false, label: t('cron.wizard.more') },
    ...(agents.length
      ? [
          choice(
            {
              order: 4,
              key: 'claude_agent',
              value: NO_AGENT,
              label: t('forms.schedule.agent'),
              help: t('forms.schedule.agentHelp'),
            },
            [
              {
                key: NO_AGENT,
                label: t('forms.schedule.noAgent'),
                description: t('forms.schedule.noAgentHelp'),
                icon: 'sparkles',
              },
              ...agents.map((a) => ({
                key: a.name,
                label: a.name,
                description: a.description || t(`forms.schedule.agentSource.${a.source}`),
                icon: AGENT_ICONS[a.source],
              })),
            ],
          ),
        ]
      : []),
    ...(claudeModels.length ? [modelField(t, 'claude', claudeModels)] : []),
    ...(codexModels.length ? [modelField(t, 'codex', codexModels)] : []),
    {
      order: 6,
      type: 'text',
      key: 'model_other',
      label: t('forms.schedule.modelOther'),
      placeholder: 'claude-sonnet-5-5',
      width: '1/2',
    },
    {
      order: 7,
      type: 'text',
      key: 'command',
      label: t('forms.schedule.command'),
      placeholder: 'curl -fsS --max-time 10 https://example.com/health',
      help: t('forms.schedule.commandHelp'),
      required: true,
    },
    {
      order: 8,
      type: 'tags',
      key: 'card_tags',
      label: t('forms.schedule.cardTags'),
      help: t('forms.schedule.cardTagsHelp'),
    },
    {
      order: 9,
      type: 'dropdown',
      key: 'playbook',
      label: t('forms.schedule.playbook'),
      help: c.playbooks.length
        ? t('forms.schedule.playbookHelp')
        : t('project.schedules.noPlaybook'),
      required: true,
      width: '1/2',
      options: c.playbooks.map((name) => ({ key: name, label: name })),
    },
  ]

  const when: FieldDescriptor[] = [
    {
      order: 1,
      type: 'schedule',
      key: 'when',
      label: t('project.schedules.when'),
      required: true,
      // a week read Monday first, as the board's people read it
      week_starts: 'mon',
    },
    {
      order: 2,
      type: 'text',
      key: 'name',
      label: t('forms.schedule.scheduleName'),
      help: t('cron.wizard.nameHelp'),
      required: true,
    },
  ]

  const runs = (op: 'eq' | 'in', value: unknown): Condition => ({
    field: `${s.what}.runs`,
    op,
    value,
  })
  const more: Condition = { field: `${s.task}.more`, op: 'eq', value: true }
  /** The model is typed in: "Other…" picked, or the CLI lists none. */
  const typed = (kind: 'claude' | 'codex', listed: boolean): Condition =>
    listed
      ? {
          and: [
            runs('eq', kind),
            { field: `${s.task}.model_${kind}`, op: 'eq', value: MODEL_OTHER },
          ],
        }
      : runs('eq', kind)

  const rules: Rule[] = [
    showWhen('agent-task', runs('in', ['claude', 'codex']), s.task, [
      'prompt',
      'use_board',
      'more',
    ]),
    showWhen('command-task', runs('eq', 'command'), s.task, ['command', 'card_tags']),
    showWhen('playbook-task', runs('eq', 'playbook'), s.task, ['playbook']),
    ...(agents.length
      ? [showWhen('agent', { and: [more, runs('eq', 'claude')] }, s.task, ['claude_agent'])]
      : []),
    ...(claudeModels.length
      ? [showWhen('model-claude', { and: [more, runs('eq', 'claude')] }, s.task, ['model_claude'])]
      : []),
    ...(codexModels.length
      ? [showWhen('model-codex', { and: [more, runs('eq', 'codex')] }, s.task, ['model_codex'])]
      : []),
    showWhen(
      'model-other',
      {
        and: [
          more,
          {
            or: [typed('claude', claudeModels.length > 0), typed('codex', codexModels.length > 0)],
          },
        ],
      },
      s.task,
      ['model_other'],
    ),
  ]

  return {
    workflow_id: 'cron-job',
    forms: [
      { form_id: 'cron-what', form_name: s.what, order: 1, fields: what },
      { form_id: 'cron-task', form_name: s.task, order: 2, fields: task },
      { form_id: 'cron-when', form_name: s.when, order: 3, fields: when },
    ],
    rules,
  }
}

type Data = Record<string, Record<string, unknown> | undefined>

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** What a new job runs first: a template's agent, else the first this machine has. */
export const firstKind = (options: AgentOptions | null): ScheduleKind =>
  scheduleKinds(options)[0] ?? 'command'

/** The data a new run starts from. */
export const cronStart = (
  t: Translate,
  options: AgentOptions | null,
  projectId: string | null,
): Record<string, Record<string, unknown>> => {
  const s = cronSteps(t)
  return {
    [s.what]: { project_id: projectId, runs: firstKind(options) },
    [s.task]: {
      use_board: true,
      more: false,
      model_claude: MODEL_DEFAULT,
      model_codex: MODEL_DEFAULT,
      claude_agent: NO_AGENT,
    },
    [s.when]: { when: TEMPLATE_CRON.bugs },
  }
}

/** A name for the job from what it does: the prompt's first line, the command, the playbook. */
export const nameFrom = (task: Record<string, unknown> | undefined): string => {
  const line =
    text(task?.['prompt'])?.split('\n')[0] ??
    text(task?.['command']) ??
    (text(task?.['playbook']) ? `playbook ${String(task?.['playbook'])}` : '')
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}

const kindOf = (v: unknown): ScheduleKind =>
  typeof v === 'string' && (SCHEDULE_KINDS as readonly string[]).includes(v)
    ? (v as ScheduleKind)
    : 'command'

/** The model as the API takes it: null for the CLI's default, the typed name for "Other…". */
const modelOf = (task: Record<string, unknown>, kind: 'claude' | 'codex'): string | null => {
  if (task['more'] !== true) return null
  const picked = text(task[`model_${kind}`])
  if (picked === null || picked === MODEL_OTHER) return text(task['model_other'])
  return picked === MODEL_DEFAULT ? null : picked
}

/** The new job as `POST /projects/:id/schedules` takes it, and the project it goes to. */
export const cronJobBody = (t: Translate, data: Data, fixedProject: string | null) => {
  const s = cronSteps(t)
  const what = data[s.what] ?? {}
  const task = data[s.task] ?? {}
  const when = data[s.when] ?? {}
  const kind = kindOf(what['runs'])
  const project = fixedProject ?? text(what['project_id'])
  const base = { name: text(when['name']) ?? nameFrom(task), cron: text(when['when']) ?? '' }
  if (kind === 'claude' || kind === 'codex') {
    const agent = task['more'] === true && kind === 'claude' ? text(task['claude_agent']) : null
    return {
      project,
      body: {
        ...base,
        agent: kind,
        prompt: text(task['prompt']),
        use_board: task['use_board'] === true,
        model: modelOf(task, kind),
        claude_agent: agent === NO_AGENT ? null : agent,
      },
    }
  }
  if (kind === 'playbook') return { project, body: { ...base, playbook: text(task['playbook']) } }
  const tags = task['card_tags']
  return {
    project,
    body: {
      ...base,
      command: text(task['command']),
      card_tags: Array.isArray(tags) ? (tags as string[]) : [],
    },
  }
}

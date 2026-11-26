import type { Registry } from '@20baht/ui'
import { defineForm } from '@20baht/ui/engine'

import type { Translate } from '../core/i18n/i18n.service'
import type { ScheduleKind, Timing } from './schedule'
import { uploadImage } from './upload'

/*
 * Every form is built from `t`, so its words follow the locale: a component keeps
 * `computed(() => cardForm(this.t))`. Examples in placeholders (paths, commands) stay as they are.
 */

/** Only images kept by this server render inside markdown. */
export const sameOriginImage = (href: string) => href.startsWith('/files/')

/** What every form here needs: the image uploader of markdown fields, and which images embed. */
export const REGISTRY: Registry = {
  uploaders: { attachments: uploadImage },
  markdownImage: sameOriginImage,
}

const body = (t: Translate) =>
  ({
    order: 2,
    type: 'markdown',
    key: 'body',
    label: t('forms.card.body'),
    uploader: 'attachments',
    help: t('forms.card.bodyHelp'),
  }) as const

const owners = (t: Translate) => [
  { key: 'autopilot', label: t('forms.card.ownerAutopilot') },
  { key: 'human', label: t('forms.card.ownerHuman') },
]

export const newCardForm = (t: Translate) =>
  defineForm({
    form_id: 'new-card',
    form_name: t('forms.newCard.name'),
    fields: [
      {
        order: 0,
        type: 'dropdown',
        key: 'project_id',
        label: t('forms.newCard.project'),
        required: true,
        options: [],
      },
      { order: 1, type: 'text', key: 'title', label: t('forms.card.title'), required: true },
      {
        order: 2,
        type: 'radio',
        key: 'owner',
        label: t('forms.card.owner'),
        required: true,
        options: owners(t),
        help: t('forms.newCard.ownerHelp'),
      },
      { ...body(t), order: 3 },
      { order: 4, type: 'tags', key: 'tags', label: t('forms.newCard.tags') },
    ],
  })

/** One line in a column: a title, Enter, and the card is in the project's to do. */
export const quickAddForm = (t: Translate) =>
  defineForm({
    form_id: 'quick-add',
    form_name: t('forms.quickAdd.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'title',
        label: t('forms.quickAdd.title'),
        placeholder: t('forms.quickAdd.placeholder'),
      },
    ],
  })

export const cardForm = (t: Translate) =>
  defineForm({
    form_id: 'card',
    form_name: t('forms.card.name'),
    fields: [
      { order: 1, type: 'text', key: 'title', label: t('forms.card.title'), required: true },
      body(t),
      {
        order: 3,
        type: 'dropdown',
        key: 'status',
        label: t('forms.card.status'),
        width: '1/3',
        options: [
          { key: 'todo', label: t('status.card.todo') },
          { key: 'doing', label: t('status.card.doing') },
          { key: 'done', label: t('status.card.done') },
        ],
      },
      {
        order: 4,
        type: 'dropdown',
        key: 'owner',
        label: t('forms.card.owner'),
        width: '1/3',
        options: [...owners(t), { key: 'none', label: t('forms.card.ownerNone') }],
      },
      {
        order: 5,
        type: 'number',
        key: 'priority',
        label: t('forms.card.priority'),
        width: '1/3',
        help: t('forms.card.priorityHelp'),
      },
      { order: 6, type: 'tags', key: 'tags', label: t('forms.card.otherTags'), width: '2/3' },
      {
        order: 7,
        type: 'text',
        key: 'waits_on',
        label: t('forms.card.waitsOn'),
        width: '1/3',
        placeholder: '12, 14',
      },
    ],
  })

export const sendBackForm = (t: Translate) =>
  defineForm({
    form_id: 'send-back',
    form_name: t('forms.sendBack.name'),
    fields: [
      {
        order: 1,
        type: 'textarea',
        key: 'comment',
        label: t('forms.sendBack.comment'),
        required: true,
        help: t('forms.sendBack.commentHelp'),
      },
    ],
  })

export const loginForm = (t: Translate) =>
  defineForm({
    form_id: 'login',
    form_name: t('forms.login.name'),
    fields: [
      { order: 1, type: 'password', key: 'token', label: t('forms.login.token'), required: true },
    ],
  })

export const workerForm = (t: Translate) =>
  defineForm({
    form_id: 'worker',
    form_name: t('forms.worker.name'),
    fields: [
      {
        order: 1,
        type: 'number',
        key: 'stale_minutes',
        label: t('forms.worker.staleMinutes'),
        width: '1/2',
        required: true,
      },
      {
        order: 2,
        type: 'number',
        key: 'concurrency',
        label: t('forms.worker.concurrency'),
        width: '1/2',
        required: true,
        help: t('forms.worker.concurrencyHelp'),
      },
      {
        order: 3,
        type: 'textarea',
        key: 'worker_path',
        label: t('forms.worker.path'),
        help: t('forms.worker.pathHelp'),
      },
    ],
  })

export const accessForm = (t: Translate) =>
  defineForm({
    form_id: 'access',
    form_name: t('forms.access.name'),
    fields: [
      {
        order: 1,
        type: 'tags',
        key: 'allowed_hosts',
        label: t('forms.access.allowedHosts'),
        help: t('forms.access.allowedHostsHelp'),
      },
      {
        order: 2,
        type: 'text',
        key: 'webhook_url',
        label: t('forms.access.webhook'),
        help: t('forms.access.webhookHelp'),
      },
      {
        order: 3,
        type: 'toggle',
        key: 'desktop_notifications',
        label: t('forms.access.desktop'),
      },
      {
        order: 4,
        type: 'text',
        key: 'public_url',
        label: t('forms.access.publicUrl'),
        placeholder: 'https://board.example.net',
        help: t('forms.access.publicUrlHelp'),
      },
    ],
  })

export const newProjectForm = (t: Translate) =>
  defineForm({
    form_id: 'new-project',
    form_name: t('forms.newProject.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'slug',
        label: t('forms.newProject.slug'),
        placeholder: 'my-app',
        required: true,
        width: '1/2',
      },
      {
        order: 2,
        type: 'text',
        key: 'name',
        label: t('forms.newProject.projectName'),
        required: true,
        width: '1/2',
      },
    ],
  })

export const projectForm = (t: Translate) =>
  defineForm({
    form_id: 'project',
    form_name: t('forms.project.name'),
    views: [
      { name: 'general', fields: ['name', 'worker_enabled', 'repo_path'] },
      {
        name: 'worker',
        fields: ['mode', 'interval_minutes', 'max_cards_per_run', 'max_turns', 'model'],
      },
      { name: 'permissions', fields: ['allowed_bash', 'web_tools', 'enabled_mcp_servers'] },
      { name: 'advanced', fields: ['extra_prompt'] },
    ],
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'name',
        label: t('forms.project.projectName'),
        required: true,
        width: '1/2',
      },
      {
        order: 2,
        type: 'toggle',
        key: 'worker_enabled',
        label: t('forms.project.workerEnabled'),
        width: '1/2',
      },
      {
        order: 3,
        type: 'text',
        key: 'repo_path',
        label: t('forms.project.repoPath'),
        placeholder: '/Users/me/code/my-app',
        help: t('forms.project.repoPathHelp'),
      },
      {
        order: 6,
        type: 'dropdown',
        key: 'mode',
        label: t('forms.project.mode'),
        width: '1/2',
        options: [
          { key: 'autopilot', label: t('forms.project.modeAutopilot') },
          { key: 'watch', label: t('forms.project.modeWatch') },
        ],
      },
      {
        order: 7,
        type: 'number',
        key: 'interval_minutes',
        label: t('forms.project.interval'),
        width: '1/3',
      },
      {
        order: 8,
        type: 'number',
        key: 'max_cards_per_run',
        label: t('forms.project.maxCards'),
        width: '1/3',
      },
      {
        order: 9,
        type: 'number',
        key: 'max_turns',
        label: t('forms.project.maxTurns'),
        width: '1/3',
      },
      {
        order: 10,
        type: 'text',
        key: 'model',
        label: t('forms.project.model'),
        placeholder: 'sonnet',
        width: '1/3',
        help: t('forms.project.modelHelp'),
      },
      {
        order: 13,
        type: 'tags',
        key: 'allowed_bash',
        label: t('forms.project.allowedBash'),
        help: t('forms.project.allowedBashHelp'),
      },
      {
        order: 14,
        type: 'tags',
        key: 'enabled_mcp_servers',
        label: t('forms.project.mcpServers'),
        width: '1/2',
      },
      { order: 16, type: 'toggle', key: 'web_tools', label: t('forms.project.webTools') },
      {
        order: 17,
        type: 'textarea',
        key: 'extra_prompt',
        label: t('forms.project.extraPrompt'),
        help: t('forms.project.extraPromptHelp'),
      },
    ],
  })

/**
 * A schedule: its name, what it runs (only the fields of `kind`) and when (only the fields of
 * `timing`). The page picks kind and timing with tabs above the form.
 */
export const scheduleForm = (
  t: Translate,
  kind: ScheduleKind,
  timing: Timing,
  playbooks: readonly string[],
) =>
  defineForm({
    form_id: 'schedule',
    form_name: t('forms.schedule.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'name',
        label: t('forms.schedule.scheduleName'),
        placeholder: t(`forms.schedule.namePlaceholder.${kind}`),
        required: true,
        width: '1/2',
      },
      ...runsFields(t, kind, playbooks),
      ...timingFields(t, timing),
    ],
  })

const runsFields = (t: Translate, kind: ScheduleKind, playbooks: readonly string[]) => {
  switch (kind) {
    case 'claude':
    case 'codex':
      return [
        {
          order: 2,
          type: 'text',
          key: 'model',
          label: t('forms.schedule.model'),
          help: t('forms.schedule.modelHelp'),
          width: '1/2',
        },
        {
          order: 3,
          type: 'textarea',
          key: 'prompt',
          label: t('forms.schedule.prompt'),
          placeholder: t('forms.schedule.promptPlaceholder'),
          help: t('forms.schedule.promptHelp'),
          required: true,
        },
        {
          order: 4,
          type: 'checkbox',
          key: 'use_board',
          label: t('forms.schedule.useBoard'),
          help: t('forms.schedule.useBoardHelp'),
        },
      ] as const
    case 'playbook':
      return [
        {
          order: 2,
          type: 'dropdown',
          key: 'playbook',
          label: t('forms.schedule.playbook'),
          help: t('forms.schedule.playbookHelp'),
          required: true,
          width: '1/2',
          options: playbooks.map((name) => ({ key: name, label: name })),
        },
      ] as const
    case 'command':
      return [
        {
          order: 2,
          type: 'text',
          key: 'command',
          label: t('forms.schedule.command'),
          placeholder: 'curl -fsS --max-time 10 https://example.com/health',
          help: t('forms.schedule.commandHelp'),
          required: true,
        },
        {
          order: 3,
          type: 'tags',
          key: 'card_tags',
          label: t('forms.schedule.cardTags'),
          help: t('forms.schedule.cardTagsHelp'),
        },
      ] as const
  }
}

/** Cron's day numbers, Sunday first. */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

const timingFields = (t: Translate, timing: Timing) => {
  const time = {
    order: 11,
    type: 'time',
    key: 'time',
    label: t('forms.schedule.time'),
    required: true,
    width: '1/3',
  } as const
  switch (timing) {
    case 'interval':
      return [
        {
          order: 10,
          type: 'number',
          key: 'interval_minutes',
          label: t('forms.schedule.interval'),
          required: true,
          width: '1/3',
        },
      ] as const
    case 'hourly':
      return [
        {
          order: 10,
          type: 'number',
          key: 'minute',
          label: t('forms.schedule.minute'),
          help: t('forms.schedule.minuteHelp'),
          width: '1/3',
        },
      ] as const
    case 'daily':
    case 'weekdays':
      return [time] as const
    case 'weekly':
      return [
        {
          order: 10,
          type: 'dropdown',
          key: 'weekday',
          label: t('forms.schedule.weekday'),
          required: true,
          width: '1/3',
          options: WEEKDAYS.map((d, i) => ({
            key: String(i),
            label: t(`forms.schedule.day.${d}`),
          })),
        },
        time,
      ] as const
    case 'cron':
      return [
        {
          order: 10,
          type: 'text',
          key: 'cron',
          label: t('forms.schedule.cron'),
          placeholder: '0 */2 * * 1-5',
          help: t('forms.schedule.cronHelp'),
          required: true,
          width: '1/2',
        },
      ] as const
  }
}

/** The name of a new playbook: what the tag `playbook:<name>` says. */
export const playbookNameForm = (t: Translate) =>
  defineForm({
    form_id: 'playbook-name',
    form_name: t('forms.playbook.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'name',
        label: t('forms.playbook.playbookName'),
        placeholder: t('forms.playbook.placeholder'),
      },
    ],
  })

/** A Claude step of the playbook: the card goes to `claude -p`, with this step's own words. */
export const claudeStepForm = (t: Translate) =>
  defineForm({
    form_id: 'claude-step',
    form_name: t('forms.step.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'name',
        label: t('forms.step.stepName'),
        required: true,
        width: '1/2',
      },
      {
        order: 2,
        type: 'text',
        key: 'model',
        label: t('forms.step.model'),
        placeholder: 'sonnet',
        help: t('forms.step.modelHelp'),
        width: '1/4',
      },
      { order: 3, type: 'number', key: 'max_turns', label: t('forms.step.maxTurns'), width: '1/4' },
      {
        order: 4,
        type: 'textarea',
        key: 'prompt',
        label: t('forms.step.prompt'),
        help: t('forms.step.promptHelp'),
      },
      {
        order: 5,
        type: 'tags',
        key: 'allow',
        label: t('forms.step.allow'),
        help: t('forms.step.allowHelp'),
      },
    ],
  })

/** A command step: `sh -c` in the project directory (ssh, tests, a deploy: anything). */
export const runStepForm = (t: Translate) =>
  defineForm({
    form_id: 'run-step',
    form_name: t('forms.step.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'name',
        label: t('forms.step.stepName'),
        required: true,
        width: '1/2',
      },
      {
        order: 2,
        type: 'number',
        key: 'timeout_minutes',
        label: t('forms.step.timeout'),
        placeholder: '15',
        width: '1/4',
      },
      {
        order: 3,
        type: 'toggle',
        key: 'continue_on_error',
        label: t('forms.step.continueOnError'),
        width: '1/4',
      },
      {
        order: 4,
        type: 'textarea',
        key: 'command',
        label: t('forms.step.command'),
        help: t('forms.step.commandHelp'),
        required: true,
      },
    ],
  })

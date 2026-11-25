import type { Registry } from '@20baht/ui'
import { defineForm } from '@20baht/ui/engine'

import type { Translate } from '../core/i18n/i18n.service'
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
  { key: 'claude', label: t('forms.card.ownerClaude') },
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

export const claudeTokenForm = (t: Translate) =>
  defineForm({
    form_id: 'claude-token',
    form_name: t('forms.claudeToken.name'),
    fields: [
      {
        order: 1,
        type: 'password',
        key: 'token',
        label: 'CLAUDE_CODE_OAUTH_TOKEN',
        help: t('forms.claudeToken.help'),
      },
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

/** What a schedule runs: a command, or one of the project's playbooks. */
export const COMMAND = 'command'

export const scheduleForm = (t: Translate, playbooks: readonly string[]) =>
  defineForm({
    form_id: 'schedule',
    form_name: t('forms.schedule.name'),
    fields: [
      {
        order: 1,
        type: 'text',
        key: 'name',
        label: t('forms.schedule.scheduleName'),
        placeholder: t('forms.schedule.namePlaceholder'),
        required: true,
        width: '1/3',
      },
      {
        order: 2,
        type: 'dropdown',
        key: 'runs',
        label: t('forms.schedule.runs'),
        help: t('forms.schedule.runsHelp'),
        width: '1/3',
        options: [
          { key: COMMAND, label: t('forms.schedule.runsCommand') },
          ...playbooks.map((name) => ({
            key: name,
            label: t('forms.schedule.runsPlaybook', { name }),
          })),
        ],
      },
      {
        order: 3,
        type: 'number',
        key: 'interval_minutes',
        label: t('forms.schedule.interval'),
        width: '1/3',
      },
      {
        order: 4,
        type: 'text',
        key: 'command',
        label: t('forms.schedule.command'),
        placeholder: 'bun run test',
        help: t('forms.schedule.commandHelp'),
      },
    ],
  })

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

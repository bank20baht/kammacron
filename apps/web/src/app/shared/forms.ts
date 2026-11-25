import type { Registry } from '@20baht/ui'
import { defineForm } from '@20baht/ui/engine'

import { uploadImage } from './upload'

/** Only images kept by this server render inside markdown. */
export const sameOriginImage = (href: string) => href.startsWith('/files/')

/** What every form here needs: the image uploader of markdown fields, and which images embed. */
export const REGISTRY: Registry = {
  uploaders: { attachments: uploadImage },
  markdownImage: sameOriginImage,
}

const body = {
  order: 2,
  type: 'markdown',
  key: 'body',
  label: 'Description',
  uploader: 'attachments',
  help: 'Paste or drop a screenshot',
} as const

export const newCardForm = defineForm({
  form_id: 'new-card',
  form_name: 'New card',
  fields: [
    {
      order: 0,
      type: 'dropdown',
      key: 'project_id',
      label: 'Project',
      required: true,
      options: [],
    },
    { order: 1, type: 'text', key: 'title', label: 'Title', required: true },
    body,
    { order: 3, type: 'tags', key: 'tags', label: 'Tags', help: '"claude": the worker takes it' },
    { order: 4, type: 'toggle', key: 'human', label: 'A person takes this card' },
  ],
})

export const cardForm = defineForm({
  form_id: 'card',
  form_name: 'Card',
  fields: [
    { order: 1, type: 'text', key: 'title', label: 'Title', required: true },
    body,
    {
      order: 3,
      type: 'tags',
      key: 'tags',
      label: 'Tags',
      help: '"claude" hands the card to the worker',
    },
    {
      order: 4,
      type: 'number',
      key: 'priority',
      label: 'Priority',
      width: '1/2',
      help: 'Higher is picked first',
    },
    {
      order: 5,
      type: 'text',
      key: 'waits_on',
      label: 'Waits on',
      width: '1/2',
      placeholder: '12, 14',
      help: 'Card numbers that must be done first',
    },
    { order: 6, type: 'toggle', key: 'human', label: 'A person takes this card' },
  ],
})

export const sendBackForm = defineForm({
  form_id: 'send-back',
  form_name: 'Send back',
  fields: [
    {
      order: 1,
      type: 'textarea',
      key: 'comment',
      label: 'What to change',
      required: true,
      help: 'The worker reads it next run',
    },
  ],
})

export const loginForm = defineForm({
  form_id: 'login',
  form_name: 'Login',
  fields: [{ order: 1, type: 'password', key: 'token', label: 'API token', required: true }],
})

export const claudeTokenForm = defineForm({
  form_id: 'claude-token',
  form_name: 'Claude token',
  fields: [
    {
      order: 1,
      type: 'password',
      key: 'token',
      label: 'CLAUDE_CODE_OAUTH_TOKEN',
      help: 'From `claude setup-token`. Kept in secrets.json (600), never in the database. Empty clears it.',
    },
  ],
})

export const workerForm = defineForm({
  form_id: 'worker',
  form_name: 'Worker',
  fields: [
    {
      order: 1,
      type: 'number',
      key: 'stale_minutes',
      label: 'A run may take (minutes)',
      width: '1/2',
      required: true,
    },
    {
      order: 2,
      type: 'number',
      key: 'concurrency',
      label: 'Runs at once',
      width: '1/2',
      required: true,
      help: 'One per project at most',
    },
    {
      order: 3,
      type: 'textarea',
      key: 'worker_path',
      label: 'PATH for the worker',
      help: 'Empty: the PATH this process started with',
    },
  ],
})

export const accessForm = defineForm({
  form_id: 'access',
  form_name: 'Access',
  fields: [
    {
      order: 1,
      type: 'tags',
      key: 'allowed_hosts',
      label: 'Allowed hosts',
      help: 'A tunnel’s host name, to open the board from elsewhere',
    },
    {
      order: 2,
      type: 'text',
      key: 'webhook_url',
      label: 'Webhook URL',
      help: 'POSTed when a card needs review or something is paused (Slack-compatible `text`)',
    },
    { order: 3, type: 'toggle', key: 'desktop_notifications', label: 'Desktop notifications' },
  ],
})

export const newProjectForm = defineForm({
  form_id: 'new-project',
  form_name: 'New project',
  fields: [
    {
      order: 1,
      type: 'text',
      key: 'slug',
      label: 'Slug',
      placeholder: 'my-app',
      required: true,
      width: '1/2',
    },
    { order: 2, type: 'text', key: 'name', label: 'Name', required: true, width: '1/2' },
  ],
})

export const projectForm = defineForm({
  form_id: 'project',
  form_name: 'Project',
  fields: [
    { order: 1, type: 'text', key: 'name', label: 'Name', required: true, width: '1/2' },
    {
      order: 2,
      type: 'toggle',
      key: 'worker_enabled',
      label: 'Claude works this project',
      width: '1/2',
    },
    {
      order: 3,
      type: 'text',
      key: 'repo_path',
      label: 'Repo path',
      placeholder: '/Users/me/code/my-app',
      help: 'Empty: a board without a worker',
      width: '2/3',
    },
    {
      order: 4,
      type: 'text',
      key: 'default_branch',
      label: 'Default branch',
      help: 'Found from origin/HEAD when empty',
      width: '1/3',
    },
    {
      order: 5,
      type: 'dropdown',
      key: 'ship_policy',
      label: 'Shipping',
      width: '1/2',
      options: [
        { key: 'push', label: 'Push to the default branch (pre-push is the gate)' },
        { key: 'branch', label: 'claude/<card> only; you approve each' },
      ],
    },
    {
      order: 6,
      type: 'dropdown',
      key: 'mode',
      label: 'Mode',
      width: '1/2',
      options: [
        { key: 'autopilot', label: 'Autopilot: decide reversible things' },
        { key: 'watch', label: 'Watch: ask when unsure' },
      ],
    },
    {
      order: 7,
      type: 'number',
      key: 'interval_minutes',
      label: 'Check every (minutes)',
      width: '1/3',
    },
    { order: 8, type: 'number', key: 'max_cards_per_run', label: 'Cards per round', width: '1/3' },
    { order: 9, type: 'number', key: 'max_turns', label: 'Max turns per card', width: '1/3' },
    {
      order: 10,
      type: 'text',
      key: 'model',
      label: 'Model',
      placeholder: 'sonnet',
      width: '1/3',
      help: 'Empty: Claude Code’s default',
    },
    {
      order: 11,
      type: 'text',
      key: 'setup_command',
      label: 'Setup command',
      placeholder: 'bun install',
      width: '1/3',
      help: 'Once, and when a lock file changes',
    },
    {
      order: 12,
      type: 'text',
      key: 'verify_command',
      label: 'Verify after push',
      placeholder: 'bun run test',
      width: '1/3',
      help: 'Fails twice: reverted',
    },
    {
      order: 13,
      type: 'tags',
      key: 'allowed_bash',
      label: 'Allowed Bash commands',
      help: 'e.g. Bash(bun test:*), Bash(bun run lint:*)',
    },
    {
      order: 14,
      type: 'tags',
      key: 'enabled_mcp_servers',
      label: 'MCP servers from the repo’s .mcp.json',
      width: '1/2',
    },
    {
      order: 15,
      type: 'tags',
      key: 'copy_files',
      label: 'Files copied into the worktree',
      width: '1/2',
    },
    {
      order: 15.5,
      type: 'number',
      key: 'max_diff_lines',
      label: 'Gate: most lines per change',
      width: '1/3',
      help: 'With a gate, Claude ships to claude/<card> and kammacron pushes it on when it passes',
    },
    {
      order: 15.6,
      type: 'tags',
      key: 'protected_paths',
      label: 'Gate: protected paths',
      width: '2/3',
      help: 'Globs a change may not touch: migrations/**, .github/**',
    },
    { order: 16, type: 'toggle', key: 'web_tools', label: 'WebSearch and WebFetch' },
    {
      order: 17,
      type: 'textarea',
      key: 'extra_prompt',
      label: 'Extra rules for Claude',
      help: 'Beside .claude-worker/prompt.md in the repo',
    },
  ],
})

export const scheduleForm = defineForm({
  form_id: 'schedule',
  form_name: 'Schedule',
  fields: [
    {
      order: 1,
      type: 'text',
      key: 'name',
      label: 'Name',
      placeholder: 'nightly tests',
      required: true,
      width: '1/3',
    },
    {
      order: 2,
      type: 'text',
      key: 'command',
      label: 'Command',
      placeholder: 'bun run test',
      required: true,
      width: '1/3',
    },
    { order: 3, type: 'number', key: 'interval_minutes', label: 'Every (minutes)', width: '1/3' },
  ],
})

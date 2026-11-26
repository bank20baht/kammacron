import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * What a project's cron job may run: which agent CLIs this machine has, the Claude Code agents
 * the project can call on (its own, the person's, and those of the plugins they turned on), and
 * the models each CLI offers. Read from the files the CLIs keep; nothing is started to find out.
 */

/** A Claude Code agent: a `.md` file with front matter (name, description, tools, model) and a prompt. */
export type ClaudeAgent = {
  /** What `--agent` takes: the file's `name`, `<plugin>:<name>` for a plugin's. */
  name: string
  description: string
  /** Where it was found: the project's `.claude/agents`, the person's, or a plugin. */
  source: 'project' | 'user' | 'plugin'
  /** Its own model (an alias or a full name); null: the session's. */
  model: string | null
  /** The tools it may use; null: every tool the session has. */
  tools: string[] | null
  /** Its system prompt: the file's body. */
  prompt: string
}

export type AgentModel = { id: string; label: string; description: string }

/** `claude --model` takes these aliases for the newest of each family. */
export const CLAUDE_MODELS: AgentModel[] = [
  { id: 'fable', label: 'Fable', description: 'The newest Fable' },
  { id: 'opus', label: 'Opus', description: 'The newest Opus' },
  { id: 'sonnet', label: 'Sonnet', description: 'The newest Sonnet' },
  { id: 'haiku', label: 'Haiku', description: 'The newest Haiku: fast and cheap' },
]

const claudeHome = () => process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
const codexHome = () => process.env['CODEX_HOME'] ?? join(homedir(), '.codex')

const readJson = async (path: string): Promise<unknown> => {
  try {
    return (await Bun.file(path).json()) as unknown
  } catch {
    return null
  }
}

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** `tools:` as Claude Code writes it: a list, or names split by commas. */
const toolList = (v: unknown): string[] | null => {
  const names = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : null
  const list = names?.map((s) => s.trim()).filter(Boolean)
  return list?.length ? list : null
}

/** One agent file: front matter between `---` lines, then the prompt. Null when it is not one. */
export const parseAgent = (
  text: string,
  source: ClaudeAgent['source'],
  prefix = '',
): ClaudeAgent | null => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return null
  let meta: Record<string, unknown>
  try {
    meta = record(Bun.YAML.parse(match[1] ?? ''))
  } catch {
    return null
  }
  const name = typeof meta['name'] === 'string' ? meta['name'].trim() : ''
  if (!name) return null
  const model = typeof meta['model'] === 'string' ? meta['model'].trim() : ''
  return {
    name: prefix + name,
    description: typeof meta['description'] === 'string' ? meta['description'].trim() : '',
    source,
    // `inherit` is the session's model, as no model is
    model: model && model !== 'inherit' ? model : null,
    tools: toolList(meta['tools']),
    prompt: (match[2] ?? '').trim(),
  }
}

/** The `.md` agents under a folder (and its folders), or none when it is missing. */
const agentsIn = async (dir: string, source: ClaudeAgent['source'], prefix = '') => {
  let files: string[]
  try {
    files = await readdir(dir, { recursive: true })
  } catch {
    return []
  }
  const found: ClaudeAgent[] = []
  for (const file of files.filter((f) => f.endsWith('.md')).sort()) {
    const agent = parseAgent(await Bun.file(join(dir, file)).text(), source, prefix)
    if (agent) found.push(agent)
  }
  return found
}

/** The plugin keys (`name@marketplace`) a settings file turns on. */
const enabledIn = async (path: string) =>
  Object.entries(record(record(await readJson(path))['enabledPlugins']))
    .filter(([, on]) => on === true)
    .map(([key]) => key)

/** The agents of the plugins turned on for the person, or for this project, as installed. */
const pluginAgents = async (projectDir: string | null) => {
  const home = claudeHome()
  const userOn = await enabledIn(join(home, 'settings.json'))
  const projectOn = projectDir
    ? [
        ...(await enabledIn(join(projectDir, '.claude', 'settings.json'))),
        ...(await enabledIn(join(projectDir, '.claude', 'settings.local.json'))),
      ]
    : []
  const installed = record(
    record(await readJson(join(home, 'plugins', 'installed_plugins.json')))['plugins'],
  )
  const found: ClaudeAgent[] = []
  for (const key of new Set([...userOn, ...projectOn])) {
    const installs = (Array.isArray(installed[key]) ? installed[key] : []).map(record)
    const install =
      installs.find((i) => i['scope'] === 'project' && i['projectPath'] === projectDir) ??
      installs.find((i) => i['scope'] !== 'project')
    const path = install?.['installPath']
    if (typeof path !== 'string') continue
    const plugin = key.split('@')[0] ?? key
    found.push(...(await agentsIn(join(path, 'agents'), 'plugin', `${plugin}:`)))
  }
  return found
}

/**
 * The agents a project's Claude can call on: the project's own first, then the person's, then
 * the plugins'; a project without a directory has the person's and the plugins'. A name met again is the first one's (as Claude Code lets a project's win).
 */
export const claudeAgents = async (projectDir: string | null): Promise<ClaudeAgent[]> => {
  const all = [
    ...(projectDir ? await agentsIn(join(projectDir, '.claude', 'agents'), 'project') : []),
    ...(await agentsIn(join(claudeHome(), 'agents'), 'user')),
    ...(await pluginAgents(projectDir)),
  ]
  const seen = new Set<string>()
  return all.filter((a) => !seen.has(a.name) && seen.add(a.name))
}

/**
 * The models Codex lists for this account, from the cache it keeps (`~/.codex/models_cache.json`),
 * in its own order; none when Codex never ran here or the cache reads otherwise.
 */
export const codexModels = async (): Promise<AgentModel[]> => {
  const models = record(await readJson(join(codexHome(), 'models_cache.json')))['models']
  if (!Array.isArray(models)) return []
  return models
    .map(record)
    .filter((m) => typeof m['slug'] === 'string' && m['visibility'] !== 'hide')
    .sort((a, b) => Number(a['priority'] ?? 0) - Number(b['priority'] ?? 0))
    .map((m) => ({
      id: String(m['slug']),
      label: typeof m['display_name'] === 'string' ? m['display_name'] : String(m['slug']),
      description: typeof m['description'] === 'string' ? m['description'] : '',
    }))
}

/** Whether a command is there to run, on the PATH the worker gives what it starts. */
export const hasCli = (bin: string, path: string) => Bun.which(bin, { PATH: path }) !== null

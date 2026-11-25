import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { exec } from './worker/git'

const LABEL = 'dev.kammacron.server'
const UNIT = 'kammacron.service'

export type ServiceSpec = {
  /** Full path of `bun` (never a bunx cache path: a cache can be cleared). */
  bun: string
  /** The installed CLI entry (global package), run as `bun <entry> start`; null for the compiled binary. */
  entry: string | null
  dataDir: string
  port: number
  /** The shell's PATH now: what `claude`, `git` and hooks need, which launchd/systemd lack. */
  path: string
}

const logFile = (dataDir: string) => join(dataDir, 'logs', 'server.log')

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const launchdPlist = (spec: ServiceSpec) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(spec.bun)}</string>${spec.entry === null ? '' : `\n    <string>${xml(spec.entry)}</string>`}
    <string>start</string>
    <string>--port</string><string>${String(spec.port)}</string>
    <string>--data-dir</string><string>${xml(spec.dataDir)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(spec.path)}</string>
    <key>HOME</key><string>${xml(homedir())}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(logFile(spec.dataDir))}</string>
  <key>StandardErrorPath</key><string>${xml(logFile(spec.dataDir))}</string>
</dict>
</plist>
`

const systemdQuote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export const systemdUnit = (spec: ServiceSpec) => `[Unit]
Description=kammacron (Kanban + MCP + Claude worker)
After=network-online.target

[Service]
Type=simple
ExecStart=${systemdQuote(spec.bun)}${spec.entry === null ? '' : ` ${systemdQuote(spec.entry)}`} start --port ${String(spec.port)} --data-dir ${systemdQuote(spec.dataDir)}
Environment=${systemdQuote(`PATH=${spec.path}`)}
Restart=always
RestartSec=10
StandardOutput=append:${logFile(spec.dataDir)}
StandardError=append:${logFile(spec.dataDir)}

[Install]
WantedBy=default.target
`

const plistPath = () => join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const unitPath = () => join(homedir(), '.config', 'systemd', 'user', UNIT)

/** Writes the service file and starts it. Returns lines to show the person. */
export const installService = async (spec: ServiceSpec): Promise<string[]> => {
  await mkdir(join(spec.dataDir, 'logs'), { recursive: true, mode: 0o700 })
  if (process.platform === 'darwin') {
    const path = plistPath()
    await mkdir(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true })
    const domain = `gui/${String(process.getuid?.() ?? 0)}`
    await exec(['launchctl', 'bootout', `${domain}/${LABEL}`], { cwd: '/' })
    await writeFile(path, launchdPlist(spec))
    const r = await exec(['launchctl', 'bootstrap', domain, path], { cwd: '/' })
    if (r.code !== 0) throw new Error(`launchctl bootstrap: ${r.stderr.trim()}`)
    return [
      `Installed ${path}`,
      `Logs: ${logFile(spec.dataDir)}`,
      `Stop: kammacron uninstall-service`,
    ]
  }
  if (process.platform === 'linux') {
    const path = unitPath()
    await mkdir(join(homedir(), '.config', 'systemd', 'user'), { recursive: true })
    await writeFile(path, systemdUnit(spec))
    for (const args of [['daemon-reload'], ['enable', '--now', UNIT], ['restart', UNIT]]) {
      const r = await exec(['systemctl', '--user', ...args], { cwd: '/' })
      if (r.code !== 0) throw new Error(`systemctl --user ${args.join(' ')}: ${r.stderr.trim()}`)
    }
    return [
      `Installed ${path}`,
      `Logs: ${logFile(spec.dataDir)}`,
      'To keep it running after you log out: loginctl enable-linger',
    ]
  }
  throw new Error(
    'install-service supports macOS (launchd) and Linux (systemd --user). On Windows run `kammacron start`, or see the Task Scheduler notes in the README.',
  )
}

export const uninstallService = async (): Promise<string[]> => {
  if (process.platform === 'darwin') {
    await exec(['launchctl', 'bootout', `gui/${String(process.getuid?.() ?? 0)}/${LABEL}`], {
      cwd: '/',
    })
    await rm(plistPath(), { force: true })
    return [`Removed ${plistPath()}`]
  }
  if (process.platform === 'linux') {
    await exec(['systemctl', '--user', 'disable', '--now', UNIT], { cwd: '/' })
    await rm(unitPath(), { force: true })
    await exec(['systemctl', '--user', 'daemon-reload'], { cwd: '/' })
    return [`Removed ${unitPath()}`]
  }
  throw new Error('no service on this platform')
}

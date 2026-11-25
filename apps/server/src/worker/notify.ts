import type { Db } from '../db'
import { getSettings } from '../services/settings'
import { exec } from './git'

const escapeAppleScript = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/** A desktop notification (macOS: osascript, Linux: notify-send); nothing elsewhere. */
const desktop = async (title: string, message: string) => {
  if (process.platform === 'darwin')
    await exec(
      [
        'osascript',
        '-e',
        `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`,
      ],
      { cwd: '/' },
    )
  else if (process.platform === 'linux') await exec(['notify-send', title, message], { cwd: '/' })
}

/** Tells the person: on the desktop when Settings allows, and to the webhook when one is set. */
export const notifier = (db: Db) => async (title: string, message: string) => {
  const settings = await getSettings(db)
  const sends: Promise<unknown>[] = []
  if (settings.desktop_notifications) sends.push(desktop(title, message))
  if (settings.webhook_url)
    sends.push(
      fetch(settings.webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // `text` reads as a message in Slack and Discord-compatible hooks; the rest for anything else
        body: JSON.stringify({
          text: `*${title}*\n${message}`,
          title,
          message,
          source: 'kammacron',
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    )
  await Promise.allSettled(sends)
}

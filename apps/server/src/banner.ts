/** The wordmark in figlet's Big Money (ne), as the owner's GitHub profile has it. */
const WORDMARK = String.raw`
 /$$
| $$
| $$   /$$  /$$$$$$  /$$$$$$/$$$$  /$$$$$$/$$$$   /$$$$$$   /$$$$$$$  /$$$$$$   /$$$$$$  /$$$$$$$
| $$  /$$/ |____  $$| $$_  $$_  $$| $$_  $$_  $$ |____  $$ /$$_____/ /$$__  $$ /$$__  $$| $$__  $$
| $$$$$$/   /$$$$$$$| $$ \ $$ \ $$| $$ \ $$ \ $$  /$$$$$$$| $$      | $$  \__/| $$  \ $$| $$  \ $$
| $$_  $$  /$$__  $$| $$ | $$ | $$| $$ | $$ | $$ /$$__  $$| $$      | $$      | $$  | $$| $$  | $$
| $$ \  $$|  $$$$$$$| $$ | $$ | $$| $$ | $$ | $$|  $$$$$$$|  $$$$$$$| $$      |  $$$$$$/| $$  | $$
|__/  \__/ \_______/|__/ |__/ |__/|__/ |__/ |__/ \_______/ \_______/|__/       \______/ |__/  |__/
`
  .slice(1, -1)
  .split('\n')

/** Three thin lines, for a terminal too narrow for the big one. */
const NARROW = [
  '┬┌─┌─┐┌┬┐┌┬┐┌─┐┌─┐┬─┐┌─┐┌┐┌',
  '├┴┐├─┤││││││├─┤│  ├┬┘│ ││││',
  '┴ ┴┴ ┴┴ ┴┴ ┴┴ ┴└─┘┴└─└─┘┘└┘',
]

/** Columns the big wordmark takes, with its indent. */
const WIDE = 2 + Math.max(...WORDMARK.map((line) => line.length))

const paint = (on: boolean, code: string, text: string) =>
  on ? `\u001B[${code}m${text}\u001B[0m` : text

/**
 * The banner over `kammacron` (help) and `kammacron start`: the wordmark, then a line with a cron
 * expression, what it is and the version. In colour unless `color` is false; the thin wordmark
 * when the terminal has fewer `columns` than the big one needs.
 */
export const bannerText = (version: string, color: boolean, columns = Infinity): string => {
  const mark = (columns >= WIDE ? WORDMARK : NARROW).map(
    (line) => `  ${paint(color, '38;5;209', line)}`,
  )
  const tagline = `  ${paint(color, '38;5;209', '* * * * *')}  ${paint(
    color,
    '2',
    `board · cron · agents   v${version}`,
  )}`
  return ['', ...mark, '', tagline, ''].join('\n')
}

/**
 * Only for a person at a terminal: never into a pipe, a log file or a service's journal, so
 * scripts and launchd/systemd logs see the plain lines. NO_COLOR keeps it but without colour.
 */
export const banner = (
  version: string,
  stream: { isTTY?: boolean; columns?: number } = process.stdout,
): string => (stream.isTTY ? bannerText(version, !process.env['NO_COLOR'], stream.columns) : '')

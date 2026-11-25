import type { ShellNavItem } from '@20baht/ui'

/** The navigator: one entry per page. `key` is the page's path, without the leading slash. */
export const NAV: ShellNavItem[] = [
  { key: 'board', label: 'Board', href: '/board' },
  { key: 'review', label: 'Review', href: '/review' },
  { key: 'runs', label: 'Runs', href: '/runs' },
  { key: 'stats', label: 'Stats', href: '/stats' },
  { key: 'settings', label: 'Settings', href: '/settings' },
]

/** The key of the entry `url` sits under, the longest one first; `''` when none does. */
export const currentKey = (url: string, keys: string[]): string => {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/^\//, '')
  const under = keys.filter((key) => key !== '' && (path === key || path.startsWith(`${key}/`)))
  return under.sort((a, b) => b.length - a.length)[0] ?? ''
}

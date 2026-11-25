import type { ShellNavItem } from '@20baht/ui'

/** The navigator: one entry per page. `key` is the page's path, without the leading slash. */
export const NAV: ShellNavItem[] = [
  { key: '', label: 'Home', href: '/' },
  { key: 'contact', label: 'Contact', href: '/contact' },
]

/** The key of the entry `url` sits under, the longest one first; `''` (Home) when none does. */
export const currentKey = (url: string, keys: string[]): string => {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/^\//, '')
  const under = keys.filter((key) => key !== '' && (path === key || path.startsWith(`${key}/`)))
  return under.sort((a, b) => b.length - a.length)[0] ?? ''
}

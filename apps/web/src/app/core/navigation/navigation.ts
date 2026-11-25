import type { ShellNavItem } from '@20baht/ui'

/** The navigator: one entry per page. `key` is the page's path, without the leading slash. */
export const NAV: ShellNavItem[] = [
  { key: 'board', label: 'Board', href: '/board', icon: 'columns' },
  { key: 'review', label: 'Review', href: '/review', icon: 'file-check' },
  { key: 'runs', label: 'Runs', href: '/runs', icon: 'play' },
  { key: 'calendar', label: 'Calendar', href: '/calendar', icon: 'calendar' },
  { key: 'stats', label: 'Stats', href: '/stats', icon: 'chart' },
  { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings' },
]

/** The navigator with the live numbers: the review count, and one entry per project's board. */
export const navWith = (
  review: number,
  projects: readonly { slug: string; name: string }[],
): ShellNavItem[] => [
  ...NAV.map((item) => (item.key === 'review' && review > 0 ? { ...item, badge: review } : item)),
  ...projects.map((p) => ({
    key: `board/${p.slug}`,
    label: p.name,
    href: `/board/${p.slug}`,
    icon: 'folder' as const,
    group: 'Projects',
  })),
]

/** The key of the entry `url` sits under, the longest one first; `''` when none does. */
export const currentKey = (url: string, keys: string[]): string => {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/^\//, '')
  const under = keys.filter((key) => key !== '' && (path === key || path.startsWith(`${key}/`)))
  return under.sort((a, b) => b.length - a.length)[0] ?? ''
}

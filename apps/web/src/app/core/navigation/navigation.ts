import type { IconName, ShellNavItem } from '@20baht/ui'

import type { Translate } from '../i18n/i18n.service'

/** The pages of the navigator, in order: `key` is the page's path, without the leading slash. */
const PAGES = [
  { key: 'board', icon: 'columns' },
  { key: 'review', icon: 'file-check' },
  { key: 'runs', icon: 'play' },
  { key: 'calendar', icon: 'calendar' },
  { key: 'stats', icon: 'chart' },
  { key: 'settings', icon: 'settings' },
] as const satisfies readonly { key: string; icon: IconName }[]

/** The navigator: one entry per page, in the locale's words. */
export const NAV = (t: Translate): ShellNavItem[] =>
  PAGES.map((page) => ({
    key: page.key,
    label: t(`nav.${page.key}`),
    href: `/${page.key}`,
    icon: page.icon,
  }))

/** The navigator with the live numbers: the review count, and one entry per project's board. */
export const navWith = (
  t: Translate,
  review: number,
  projects: readonly { slug: string; name: string }[],
): ShellNavItem[] => [
  ...NAV(t).map((item) =>
    item.key === 'review' && review > 0 ? { ...item, badge: review } : item,
  ),
  ...projects.map((p) => ({
    key: `board/${p.slug}`,
    label: p.name,
    href: `/board/${p.slug}`,
    icon: 'folder' as const,
    group: t('nav.projects'),
  })),
]

/** The key of the entry `url` sits under, the longest one first; `''` when none does. */
export const currentKey = (url: string, keys: string[]): string => {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/^\//, '')
  const under = keys.filter((key) => key !== '' && (path === key || path.startsWith(`${key}/`)))
  return under.sort((a, b) => b.length - a.length)[0] ?? ''
}

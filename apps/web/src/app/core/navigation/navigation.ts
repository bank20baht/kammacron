import type { IconName, ShellNavItem } from '@20baht/ui'

import type { Translate } from '../i18n/i18n.service'

/**
 * The pages of the navigator, in order, under the heading of what they are about: the board,
 * the cron jobs and what they ran, and the install itself. `key` is the page's path, without
 * the leading slash. The projects' boards come between Cron and System.
 */
const PAGES = [
  { key: 'board', icon: 'columns', group: 'kanban' },
  { key: 'review', icon: 'file-check', group: 'kanban' },
  { key: 'cron', icon: 'clock', group: 'cron' },
  { key: 'runs', icon: 'play', group: 'cron' },
  { key: 'calendar', icon: 'calendar', group: 'cron' },
  { key: 'stats', icon: 'chart', group: 'system' },
  { key: 'settings', icon: 'settings', group: 'system' },
] as const satisfies readonly { key: string; icon: IconName; group: string }[]

const entry = (t: Translate, page: (typeof PAGES)[number]): ShellNavItem => ({
  key: page.key,
  label: t(`nav.${page.key}`),
  href: `/${page.key}`,
  icon: page.icon,
  group: t(`nav.groups.${page.group}`),
})

/** The navigator: one entry per page, in the locale's words. */
export const NAV = (t: Translate): ShellNavItem[] => PAGES.map((page) => entry(t, page))

/** The navigator with the live numbers: the review count, and one entry per project's board. */
export const navWith = (
  t: Translate,
  review: number,
  projects: readonly { slug: string; name: string }[],
): ShellNavItem[] => {
  const pages = NAV(t).map((item) =>
    item.key === 'review' && review > 0 ? { ...item, badge: review } : item,
  )
  const system = t('nav.groups.system')
  return [
    ...pages.filter((item) => item.group !== system),
    ...projects.map((p) => ({
      key: `board/${p.slug}`,
      label: p.name,
      href: `/board/${p.slug}`,
      icon: 'folder' as const,
      group: t('nav.projects'),
    })),
    ...pages.filter((item) => item.group === system),
  ]
}

/** The key of the entry `url` sits under, the longest one first; `''` when none does. */
export const currentKey = (url: string, keys: string[]): string => {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/^\//, '')
  const under = keys.filter((key) => key !== '' && (path === key || path.startsWith(`${key}/`)))
  return under.sort((a, b) => b.length - a.length)[0] ?? ''
}

/**
 * Architecture boundaries, checked with `bun run deps`. `generic` gives no-circular and
 * production-not-tests. The rules below keep the web app's layers and the packages in order.
 * Every rule is `error`: a violation is a decision, not a warning.
 */
import { makeConfig } from '@20baht/strict/depcruise'

const base = makeConfig({ generic: true })

export default {
  ...base,
  forbidden: [
    ...base.forbidden,
    {
      name: 'web-lower-layers-know-no-page',
      severity: 'error',
      comment: 'core/, services/ and shared/ know no page; pages are reached through the router.',
      from: { path: '^apps/web/src/app/(core|services|shared)/' },
      to: { path: '^apps/web/src/app/modules/' },
    },
    {
      name: 'packages-know-no-app',
      severity: 'error',
      comment: 'packages/ are below the apps; the server reaches them only as built types.',
      from: { path: '^packages/' },
      to: { path: '^apps/', pathNot: '^apps/server/dist/types/' },
    },
  ],
}

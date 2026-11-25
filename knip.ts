import { knip } from '@20baht/strict/knip'

const SRC = ['src/**/*.ts']

/** A workspace tested with `bun test`: the tests are its entries. */
const tested = { entry: ['test/**/*.test.ts'], project: [...SRC, 'test/**/*.ts'] }

export default knip({
  ignoreDependencies: [
    // Angular's compiler emits tslib helpers (importHelpers).
    'tslib',
    // Optional peers of @20baht/ui, which imports them on demand (date and markdown fields).
    'dompurify',
    'flatpickr',
    'marked',
  ],
  workspaces: {
    '.': { entry: ['scripts/*.ts'], project: ['scripts/**/*.ts'] },
    'apps/server': tested,
    'apps/web': { project: SRC },
    'packages/kit': tested,
  },
})

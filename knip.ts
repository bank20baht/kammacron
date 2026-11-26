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
    // apps/docs: Astro's image service, and fonts named only as CSS paths in astro.config.mjs
    'sharp',
    '@fontsource/anuphan',
    '@fontsource/jetbrains-mono',
    // apps/docs: imported only by the scripts of .astro components, which knip does not read
    '@20baht/stickers',
  ],
  workspaces: {
    '.': { entry: ['scripts/*.ts'], project: ['scripts/**/*.ts'] },
    'apps/server': {
      entry: ['src/cli.ts', 'test/**/*.test.ts', 'test/fixtures/*.ts'],
      project: [...SRC, 'test/**/*.ts'],
    },
    'apps/web': { project: SRC },
    'packages/kit': tested,
    // Astro finds its own entries: astro.config.mjs, content.config.ts and the pages
    'apps/docs': { project: ['src/**/*.ts'] },
  },
})

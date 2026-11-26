import { defineConfig, globalIgnores } from 'eslint/config'

import { angular, bahtui, base } from '@20baht/strict/eslint'

/** The web app and the kit it compiles in. */
const WEB = ['apps/web/src/**', 'packages/kit/src/**']

// Every rule is an error. Add app overrides below, each with a reason:
//   // eslint-disable-next-line <rule> -- <why>
export default defineConfig([
  // Astro's generated types (apps/docs); agent skills installed as they are published (.claude)
  globalIgnores(['**/.astro/', '.claude/']),
  ...base,
  ...angular({
    files: WEB,
    restrictedImports: [
      {
        name: 'server',
        allowTypeImports: true,
        message:
          'The web app shares the server only as types (the eden App type); no server runtime code in a bundle.',
      },
    ],
  }),
  ...bahtui({ files: WEB, tokenFiles: ['apps/web/src/styles.css'] }),
])

import { defineConfig, globalIgnores } from 'eslint/config'

import { angular, bahtui, base } from '@20baht/strict/eslint'

/** The web app and the kit it compiles in. */
const WEB = ['apps/web/src/**', 'packages/kit/src/**']

/**
 * The web app's first script: what every page waits for. Anything these files import statically
 * is in it, so a heavy import here slows every page (a toast import once added 162 KB).
 */
const FIRST_SCRIPT = [
  'apps/web/src/main.ts',
  'apps/web/src/app/app.ts',
  'apps/web/src/app/app.config.ts',
  'apps/web/src/app/app.routes.ts',
  'apps/web/src/app/core/**/*.ts',
  'apps/web/src/app/services/**/*.ts',
  'apps/web/src/app/shared/status-bar.component.ts',
]

/** A rule that reports every node a selector matches, with one message. */
const selectorRule = (selector: string, message: string) => ({
  meta: { type: 'problem' as const, schema: [], messages: { found: message } },
  create: (context: { report: (d: { node: object; messageId: 'found' }) => void }) => ({
    [selector]: (node: object) => {
      context.report({ node, messageId: 'found' })
    },
  }),
})

/**
 * Mistakes found in this app once, made rules so they cannot come back. Each has a test of its
 * own in the review that found it; the message says what to do instead.
 */
const kammacron = {
  meta: { name: 'kammacron' },
  rules: {
    'no-untyped-form-data': selectorRule(
      "CallExpression[callee.property.name='getData'][callee.object.property.name='element']",
      'The element\'s getData() is Record<string, unknown>. Hand the template\'s #f="bahtForm" to the handler (typed FormOf<typeof yourForm>) and call f.getData(): typed from the form.',
    ),
    'no-unguarded-request': selectorRule(
      "AwaitExpression[argument.callee.name='firstValueFrom']:not(TryStatement > BlockStatement AwaitExpression):not(CallExpression[callee.name=/^(attempt|attemptWithNotice)$/] AwaitExpression):not(CallExpression[callee.property.name='act'] AwaitExpression)",
      'A request a person started fails silently here. Wrap it in attempt() or attemptWithNotice() (shared/attempt.ts), or try/catch it and show the error.',
    ),
    'no-heavy-first-script-import': selectorRule(
      "ImportDeclaration[importKind!='type'][source.value=/^@20baht\\/(angular|ui\\/overlay)$/]",
      "This file is in the first script every page waits for. Import a directive by its module ('@20baht/angular/elements/<name>'), and the overlay with import() where it is used.",
    ),
  },
}

// Every rule is an error. Add app overrides below, each with a reason:
//   // eslint-disable-next-line <rule> -- <why>
export default defineConfig([
  // Astro's generated types (apps/docs); agent skills installed as they are published (.claude);
  // local screenshots and video scripts, which git does not track (docs/screenshots)
  globalIgnores(['**/.astro/', '.claude/', 'docs/screenshots/']),
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
  // elements.ts registers the shell's <baht-*>, and each component imports the ones it draws:
  // lint fails on a tag a template draws that neither brings
  ...bahtui({
    files: WEB,
    tokenFiles: ['apps/web/src/styles.css'],
    elements: ['apps/web/src/elements.ts'],
    perComponent: true,
  }),
  // a promise in the long-running server is awaited or caught, `void` included: an unhandled
  // rejection there ends the process (the scheduler's tick once could)
  {
    files: ['apps/server/src/**/*.ts'],
    rules: { '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }] },
  },
  // $any() turns off the template's types: the events' types come from the directives
  {
    files: ['apps/web/src/**/*.html'],
    rules: { '@angular-eslint/template/no-any': 'error' },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    plugins: { kammacron },
    rules: { 'kammacron/no-untyped-form-data': 'error' },
  },
  {
    files: ['apps/web/src/app/**/*.component.ts'],
    plugins: { kammacron },
    rules: { 'kammacron/no-unguarded-request': 'error' },
  },
  {
    files: FIRST_SCRIPT,
    ignores: ['**/*.spec.ts'],
    plugins: { kammacron },
    rules: { 'kammacron/no-heavy-first-script-import': 'error' },
  },
  // the web app's service worker: plain JS served as is, with a worker's globals
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
])

import { defineConfig } from 'eslint/config'

import { base } from '@20baht/strict/eslint'

// Every rule in `base` is an error. Add app overrides below, each with a reason:
//   // eslint-disable-next-line <rule> -- <why>
export default defineConfig([...base])

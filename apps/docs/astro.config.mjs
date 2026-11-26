// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://kammacron.pages.dev',
  output: 'static',
  server: { port: 4321 },
  integrations: [
    starlight({
      title: 'kammacron',
      description:
        'An easy scheduler with a board, on your own machine. Run any command on an interval, and Claude Code if you want it.',
      logo: { src: './src/assets/app-mark.webp', replacesTitle: false },
      favicon: '/favicon.ico?v=buffalo-1',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/bank20baht/kammacron' },
      ],
      customCss: [
        '@fontsource/anuphan/400.css',
        '@fontsource/anuphan/600.css',
        '@fontsource/anuphan/700.css',
        '@fontsource/jetbrains-mono/400.css',
        './src/styles/theme.css',
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { slug: 'start/install', label: 'Install' },
            { slug: 'start/first-steps', label: 'First steps' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { slug: 'guides/board', label: 'The board' },
            { slug: 'guides/worker', label: 'How a card is worked' },
            { slug: 'guides/playbook', label: 'Playbooks' },
            { slug: 'guides/review', label: 'Review' },
            { slug: 'guides/permissions', label: 'Permissions and safety' },
            { slug: 'guides/schedules', label: 'Schedules and the calendar' },
            { slug: 'guides/mcp', label: 'Claude Code and MCP' },
            { slug: 'guides/notifications', label: 'Alerts and notifications' },
            { slug: 'guides/remote', label: 'Reaching it from elsewhere' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { slug: 'reference/cli', label: 'CLI' },
            { slug: 'reference/project-settings', label: 'Project settings' },
            { slug: 'reference/settings', label: 'Global settings' },
            { slug: 'reference/environment', label: 'Environment variables' },
            { slug: 'reference/api', label: 'HTTP API' },
            { slug: 'reference/data', label: 'Data on disk' },
          ],
        },
        { slug: 'development', label: 'Development' },
      ],
    }),
  ],
})

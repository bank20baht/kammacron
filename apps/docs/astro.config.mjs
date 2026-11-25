// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  server: { port: 4321 },
  integrations: [
    starlight({
      title: 'kammacron',
      description:
        'A Kanban board, an MCP server and an unattended Claude Code worker in one process on your own machine.',
      logo: { src: './src/assets/mark.svg', replacesTitle: false },
      favicon: '/favicon.svg',
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
            { slug: 'guides/working-copy', label: 'Repo folder or worktree' },
            { slug: 'guides/shipping', label: 'Shipping and review' },
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

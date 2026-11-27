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
        'A Kanban board and a cron-job GUI on your own machine. Schedule Claude or Codex with your own prompt, or any command, and only look when something needs you.',
      logo: { src: './src/assets/app-mark.webp', replacesTitle: false },
      favicon: '/favicon.ico?v=buffalo-1',
      // a guide's title with its sticker beside it (frontmatter `sticker:`)
      components: { PageTitle: './src/components/PageTitle.astro' },
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
            { slug: 'guides/schedules', label: 'Cron jobs and the calendar' },
            { slug: 'guides/worker', label: 'How a card is worked' },
            { slug: 'guides/playbook', label: 'Playbooks' },
            { slug: 'guides/review', label: 'Review' },
            { slug: 'guides/sessions', label: 'Sessions on this machine' },
            { slug: 'guides/permissions', label: 'Permissions and safety' },
            { slug: 'guides/mcp', label: 'Agents and MCP' },
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

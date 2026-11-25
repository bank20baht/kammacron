import type { Routes } from '@angular/router'

import type { MessageKey } from './core/i18n/i18n.service'
import { sessionGuard } from './core/session.guard'

/** One lazy page per route; `title` is a message key (`I18nTitle` puts it in the tab). A new page also gets a line in `core/navigation/navigation.ts`. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'board' },
  {
    path: 'login',
    title: 'titles.open' satisfies MessageKey,
    loadComponent: () => import('./modules/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [sessionGuard],
    children: [
      {
        path: 'board',
        title: 'titles.board' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'board/:slug',
        title: 'titles.board' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'review',
        title: 'titles.review' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/review/review.component').then((m) => m.ReviewComponent),
      },
      {
        path: 'runs',
        title: 'titles.runs' satisfies MessageKey,
        loadComponent: () => import('./modules/runs/runs.component').then((m) => m.RunsComponent),
      },
      {
        path: 'runs/:id',
        title: 'titles.run' satisfies MessageKey,
        loadComponent: () => import('./modules/runs/run.component').then((m) => m.RunComponent),
      },
      {
        path: 'calendar',
        title: 'titles.calendar' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/calendar/calendar.component').then((m) => m.CalendarComponent),
      },
      {
        path: 'stats',
        title: 'titles.stats' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/stats/stats.component').then((m) => m.StatsComponent),
      },
      {
        path: 'settings',
        title: 'titles.settings' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'settings/projects/:id',
        title: 'titles.project' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/settings/project-settings.component').then(
            (m) => m.ProjectSettingsComponent,
          ),
      },
      {
        path: 'welcome',
        title: 'titles.welcome' satisfies MessageKey,
        loadComponent: () =>
          import('./modules/welcome/welcome.component').then((m) => m.WelcomeComponent),
      },
    ],
  },
  {
    path: '**',
    title: 'titles.notFound' satisfies MessageKey,
    loadComponent: () =>
      import('./modules/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
]

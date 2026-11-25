import type { Routes } from '@angular/router'

import { sessionGuard } from './core/session.guard'

/** One lazy page per route. A new page also gets a line in `core/navigation/navigation.ts`. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'board' },
  {
    path: 'login',
    title: 'Open · kammacron',
    loadComponent: () => import('./modules/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [sessionGuard],
    children: [
      {
        path: 'board',
        title: 'Board · kammacron',
        loadComponent: () =>
          import('./modules/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'board/:slug',
        title: 'Board · kammacron',
        loadComponent: () =>
          import('./modules/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'review',
        title: 'Review · kammacron',
        loadComponent: () =>
          import('./modules/review/review.component').then((m) => m.ReviewComponent),
      },
      {
        path: 'runs',
        title: 'Runs · kammacron',
        loadComponent: () => import('./modules/runs/runs.component').then((m) => m.RunsComponent),
      },
      {
        path: 'runs/:id',
        title: 'Run · kammacron',
        loadComponent: () => import('./modules/runs/run.component').then((m) => m.RunComponent),
      },
      {
        path: 'stats',
        title: 'Stats · kammacron',
        loadComponent: () =>
          import('./modules/stats/stats.component').then((m) => m.StatsComponent),
      },
      {
        path: 'settings',
        title: 'Settings · kammacron',
        loadComponent: () =>
          import('./modules/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'settings/projects/:id',
        title: 'Project · kammacron',
        loadComponent: () =>
          import('./modules/settings/project-settings.component').then(
            (m) => m.ProjectSettingsComponent,
          ),
      },
      {
        path: 'welcome',
        title: 'Welcome · kammacron',
        loadComponent: () =>
          import('./modules/welcome/welcome.component').then((m) => m.WelcomeComponent),
      },
    ],
  },
  {
    path: '**',
    title: 'Not found · kammacron',
    loadComponent: () =>
      import('./modules/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
]

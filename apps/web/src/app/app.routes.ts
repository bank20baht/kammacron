import type { Routes } from '@angular/router'

/** One lazy page per route. A new page also gets a line in `core/navigation/navigation.ts`. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'kammacron',
    loadComponent: () => import('./modules/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: '**',
    title: 'Not found · kammacron',
    loadComponent: () =>
      import('./modules/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
]

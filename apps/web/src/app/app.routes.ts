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
    path: 'contact',
    title: 'Contact · kammacron',
    loadComponent: () =>
      import('./modules/contact/contact.component').then((m) => m.ContactComponent),
  },
  {
    path: '**',
    title: 'Not found · kammacron',
    loadComponent: () =>
      import('./modules/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
]

import { Routes } from '@angular/router';
import { requireKey } from './admin-api';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  { path: 'apps', canActivate: [requireKey], loadComponent: () => import('./pages/apps').then((m) => m.AppsPage) },
  {
    path: 'apps/:appKey',
    canActivate: [requireKey],
    loadComponent: () => import('./pages/app-detail').then((m) => m.AppDetailPage),
  },
  {
    path: 'apps/:appKey/tours/:tourId',
    canActivate: [requireKey],
    loadComponent: () => import('./pages/tour-editor').then((m) => m.TourEditorPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'apps' },
  { path: '**', redirectTo: 'apps' },
];

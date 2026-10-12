import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { App, FieldErrors, Tour } from './models';

const KEY_STORAGE = 'gt-admin-key';

/** Holds the admin key for this browser tab. */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  readonly key = signal<string | null>(sessionStorage.getItem(KEY_STORAGE));

  set(key: string | null): void {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
    this.key.set(key);
  }
}

export const adminKeyInterceptor: HttpInterceptorFn = (req, next) => {
  const key = inject(AdminSession).key();
  return next(key && req.url.startsWith('/api/admin') ? req.clone({ setHeaders: { 'X-Admin-Key': key } }) : req);
};

export const requireKey: CanActivateFn = () =>
  inject(AdminSession).key() ? true : inject(Router).createUrlTree(['/login']);

/** Typed wrapper over the admin REST API. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);
  private base = '/api/admin';

  whoami = () => firstValueFrom(this.http.get(`${this.base}/whoami`));

  apps = () => firstValueFrom(this.http.get<App[]>(`${this.base}/apps`));
  app = (key: string) => firstValueFrom(this.http.get<App>(`${this.base}/apps/${key}`));
  createApp = (app: App) => firstValueFrom(this.http.post<App>(`${this.base}/apps`, app));
  updateApp = (app: App) => firstValueFrom(this.http.put<App>(`${this.base}/apps/${app.key}`, app));

  tours = (appKey: string) => firstValueFrom(this.http.get<Tour[]>(`${this.base}/apps/${appKey}/tours`));
  tour = (appKey: string, id: string) =>
    firstValueFrom(this.http.get<Tour>(`${this.base}/apps/${appKey}/tours/${id}`));
  createTour = (appKey: string, tour: Tour) =>
    firstValueFrom(this.http.post<Tour>(`${this.base}/apps/${appKey}/tours`, tour));
  updateTour = (appKey: string, originalId: string, tour: Tour) =>
    firstValueFrom(this.http.put<Tour>(`${this.base}/apps/${appKey}/tours/${originalId}`, tour));
  deleteTour = (appKey: string, id: string) =>
    firstValueFrom(this.http.delete(`${this.base}/apps/${appKey}/tours/${id}`));
}

/** Turn an API failure into a message plus per-field errors. */
export function describeError(err: unknown): { message: string; fields: FieldErrors } {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 400 && err.error?.errors) {
      return { message: 'Please fix the highlighted fields.', fields: err.error.errors as FieldErrors };
    }
    if (err.status === 401) return { message: 'The admin key was rejected.', fields: {} };
    if (err.error?.error) return { message: err.error.error, fields: {} };
    if (err.status === 0) return { message: 'Cannot reach the tours API. Is the server running?', fields: {} };
    return { message: `Request failed (${err.status}).`, fields: {} };
  }
  return { message: String(err), fields: {} };
}

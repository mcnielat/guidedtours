import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, describeError } from '../admin-api';
import { App, FieldErrors } from '../models';

@Component({
  selector: 'app-apps',
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>Systems</h1>
        <p class="muted">Each system embeds the engine with its own key and has its own tours.</p>
      </div>
      <button class="btn primary" data-tour="new-app" (click)="adding.set(!adding())">+ Add system</button>
    </div>

    @if (adding()) {
      <form class="card" (ngSubmit)="create()">
        <div class="grid-2">
          <label class="field">
            <span>Name</span>
            <input name="name" [(ngModel)]="draft.name" required />
            @for (m of errors()['name']; track m) { <small class="error">{{ m }}</small> }
          </label>
          <label class="field">
            <span>Key <small class="muted">(used in data-app="…")</small></span>
            <input name="key" [(ngModel)]="draft.key" placeholder="e.g. tasky" required />
            @for (m of errors()['key']; track m) { <small class="error">{{ m }}</small> }
          </label>
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <div class="row end">
          <button type="button" class="btn" (click)="adding.set(false)">Cancel</button>
          <button type="submit" class="btn primary">Create</button>
        </div>
      </form>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <div class="list" data-tour="apps-list">
        @for (a of apps(); track a.key) {
          <a class="list-item" [routerLink]="['/apps', a.key]">
            <span class="swatch" [style.background]="a.accentColor || '#4f46e5'"></span>
            <span class="grow">
              <strong>{{ a.name }}</strong>
              <small class="muted mono">{{ a.key }}</small>
            </span>
            <span class="pill">{{ a.tourCount }} tours</span>
          </a>
        } @empty {
          <p class="muted">No systems yet.</p>
        }
      </div>
    }
    @if (loadError()) { <p class="error">{{ loadError() }}</p> }
  `,
})
export class AppsPage implements OnInit {
  private api = inject(AdminApi);
  private router = inject(Router);
  apps = signal<App[]>([]);
  loading = signal(true);
  loadError = signal('');
  adding = signal(false);
  draft: App = { key: '', name: '' };
  error = signal('');
  errors = signal<FieldErrors>({});

  async ngOnInit(): Promise<void> {
    try {
      this.apps.set(await this.api.apps());
    } catch (err) {
      this.loadError.set(describeError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    try {
      const app = await this.api.createApp(this.draft);
      await this.router.navigate(['/apps', app.key]);
    } catch (err) {
      const e = describeError(err);
      this.error.set(e.message);
      this.errors.set(e.fields);
    }
  }
}

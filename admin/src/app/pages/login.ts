import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminApi, AdminSession, describeError } from '../admin-api';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <form class="card narrow" (ngSubmit)="submit()">
      <h1>Sign in</h1>
      <p class="muted">Enter the admin API key. In development it is <code>dev-admin-key</code>.</p>
      <label class="field">
        <span>Admin key</span>
        <input name="key" type="password" [(ngModel)]="key" autocomplete="current-password" required autofocus />
      </label>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
      <button class="btn primary" type="submit" [disabled]="busy() || !key">Sign in</button>
    </form>
  `,
})
export class LoginPage {
  private api = inject(AdminApi);
  private session = inject(AdminSession);
  private router = inject(Router);
  key = '';
  error = signal('');
  busy = signal(false);

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.session.set(this.key.trim());
    try {
      await this.api.whoami();
      await this.router.navigate(['/apps']);
    } catch (err) {
      this.session.set(null);
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}

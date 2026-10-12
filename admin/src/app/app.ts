import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AdminSession } from './admin-api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a routerLink="/apps" class="brand"><span class="logo">◎</span> Guided Tours</a>
      <span class="grow"></span>
      @if (session.key()) {
        <!-- The admin portal onboards its own users with the same engine. -->
        <button class="btn ghost" data-tour-start="admin-basics" data-tour="help">How this works</button>
        <button class="btn ghost" (click)="signOut()">Sign out</button>
      }
    </header>
    <main class="page">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected session = inject(AdminSession);
  private router = inject(Router);

  signOut(): void {
    this.session.set(null);
    this.router.navigate(['/login']);
  }
}

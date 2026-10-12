import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApi, describeError } from '../admin-api';
import { App, Tour } from '../models';

@Component({
  selector: 'app-app-detail',
  imports: [RouterLink, FormsModule, DatePipe],
  template: `
    <nav class="crumbs"><a routerLink="/apps">Systems</a> / {{ app()?.name ?? appKey() }}</nav>

    @if (app(); as a) {
      <div class="page-head">
        <div>
          <h1>{{ a.name }}</h1>
          <p class="muted">Tours for this system. Published changes go live on the next page load.</p>
        </div>
        <a class="btn primary" data-tour="new-tour" [routerLink]="['/apps', a.key, 'tours', 'new']">+ New tour</a>
      </div>

      <div class="list" data-tour="tours-list">
        @for (t of tours(); track t.id) {
          <div class="list-item">
            <span class="grow">
              <a [routerLink]="['/apps', a.key, 'tours', t.id]"><strong>{{ t.title }}</strong></a>
              <small class="muted">
                <span class="mono">{{ t.id }}</span> · {{ t.steps.length }} steps · v{{ t.version }}
                · auto-start: {{ t.autoStart }}{{ t.showInChooser ? '' : ' · hidden from chooser' }}
                · updated {{ t.updatedAt | date: 'short' }}
              </small>
            </span>
            <label class="toggle" [attr.data-tour]="$first ? 'publish-toggle' : null" title="Published tours are served to the app">
              <input type="checkbox" [checked]="t.isPublished" (change)="togglePublish(t)" />
              <span>{{ t.isPublished ? 'Published' : 'Draft' }}</span>
            </label>
            @if (a.hostUrl && t.isPublished) {
              <a class="btn small" [href]="previewUrl(a, t)" target="_blank" rel="noopener">Try it ↗</a>
            }
            <a class="btn small" [routerLink]="['/apps', a.key, 'tours', t.id]">Edit</a>
          </div>
        } @empty {
          <p class="muted">No tours yet.</p>
        }
      </div>

      <details class="card" data-tour="app-settings">
        <summary><strong>System settings</strong> <span class="muted">· chooser text, accent colour, embed snippet</span></summary>
        <form (ngSubmit)="saveApp()" class="stack">
          <div class="grid-2">
            <label class="field"><span>Name</span><input name="name" [(ngModel)]="a.name" /></label>
            <label class="field"><span>Host URL <small class="muted">(for "Try it" links)</small></span>
              <input name="hostUrl" [(ngModel)]="a.hostUrl" placeholder="https://app.example.com/" /></label>
            <label class="field"><span>Chooser title</span><input name="ct" [(ngModel)]="a.chooserTitle" placeholder="What's new" /></label>
            <label class="field"><span>Accent colour</span>
              <span class="row"><input name="ac" [(ngModel)]="a.accentColor" placeholder="#4f46e5" />
              <input type="color" name="acp" [(ngModel)]="a.accentColor" class="color" /></span></label>
          </div>
          <label class="field"><span>Chooser subtitle</span><textarea name="cs" rows="2" [(ngModel)]="a.chooserSubtitle"></textarea></label>
          @if (appMsg()) { <p [class.error]="appMsgIsError()" [class.ok]="!appMsgIsError()">{{ appMsg() }}</p> }
          <div class="row end"><button class="btn primary" type="submit">Save settings</button></div>
        </form>
        <h3>Embed in {{ a.name }}</h3>
        <p class="muted">Add once to the host app's HTML. Everything else is config.</p>
        <pre class="code">{{ snippet(a) }}</pre>
      </details>
    } @else if (error()) {
      <p class="error">{{ error() }}</p>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class AppDetailPage implements OnInit {
  private api = inject(AdminApi);
  appKey = input.required<string>();
  app = signal<App | null>(null);
  tours = signal<Tour[]>([]);
  error = signal('');
  appMsg = signal('');
  appMsgIsError = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [app, tours] = await Promise.all([this.api.app(this.appKey()), this.api.tours(this.appKey())]);
      this.app.set(app);
      this.tours.set(tours);
    } catch (err) {
      this.error.set(describeError(err).message);
    }
  }

  async togglePublish(t: Tour): Promise<void> {
    try {
      const saved = await this.api.updateTour(this.appKey(), t.id, { ...t, isPublished: !t.isPublished });
      this.tours.update((list) => list.map((x) => (x.id === t.id ? saved : x)));
    } catch (err) {
      alert(describeError(err).message);
    }
  }

  async saveApp(): Promise<void> {
    try {
      this.app.set(await this.api.updateApp(this.app()!));
      this.appMsgIsError.set(false);
      this.appMsg.set('Saved. Host apps pick this up on their next page load.');
    } catch (err) {
      this.appMsgIsError.set(true);
      this.appMsg.set(describeError(err).message);
    }
  }

  previewUrl(a: App, t: Tour): string {
    const url = new URL(a.hostUrl!, location.origin);
    url.searchParams.set('tour', t.id);
    return url.href;
  }

  snippet(a: App): string {
    return [
      `<script src="${location.origin}/sdk/tour.js" data-app="${a.key}" defer></script>`,
      ``,
      `<!-- any element can trigger a tour -->`,
      `<button data-tour-chooser>What's new</button>`,
      `<button data-tour-start="${this.tours()[0]?.id ?? 'tour-id'}">Take the tour</button>`,
      ``,
      `<!-- or from code -->`,
      `<script>Tour.start("${this.tours()[0]?.id ?? 'tour-id'}")</script>`,
    ].join('\n');
  }
}

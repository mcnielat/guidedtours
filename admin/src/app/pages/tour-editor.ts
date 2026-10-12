import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, HostListener, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, describeError } from '../admin-api';
import { App, AUTO_STARTS, clean, FieldErrors, newStep, newTour, Tour } from '../models';
import { StepEditor } from './step-editor';

@Component({
  selector: 'app-tour-editor',
  imports: [FormsModule, RouterLink, CdkDropList, CdkDrag, CdkDragHandle, StepEditor],
  templateUrl: './tour-editor.html',
})
export class TourEditorPage implements OnInit {
  private api = inject(AdminApi);
  private router = inject(Router);

  appKey = input.required<string>();
  tourId = input.required<string>();

  app = signal<App | null>(null);
  tour = signal<Tour | null>(null);
  selected = signal(0);
  tab = signal<'steps' | 'json'>('steps');
  dirty = signal(false);
  saving = signal(false);
  message = signal<{ text: string; error: boolean } | null>(null);
  errors = signal<FieldErrors>({});
  jsonText = signal('');
  jsonError = signal('');
  loadError = signal('');

  autoStarts = AUTO_STARTS;
  isNew = computed(() => this.tourId() === 'new');
  /** The id the tour was loaded with; the URL to PUT to even if the id is being renamed. */
  private originalId = '';

  async ngOnInit(): Promise<void> {
    try {
      this.app.set(await this.api.app(this.appKey()));
      const tour = this.isNew() ? newTour() : await this.api.tour(this.appKey(), this.tourId());
      tour.steps.forEach((s) => (s.before ??= []));
      this.originalId = tour.id;
      this.tour.set(tour);
    } catch (err) {
      this.loadError.set(describeError(err).message);
    }
  }

  // ---------- steps ----------

  addStep(): void {
    const t = this.tour()!;
    t.steps.splice(this.selected() + 1, 0, newStep());
    this.selected.set(this.selected() + 1);
    this.touch();
  }

  duplicateStep(i: number): void {
    const t = this.tour()!;
    t.steps.splice(i + 1, 0, structuredClone(t.steps[i]));
    this.selected.set(i + 1);
    this.touch();
  }

  removeStep(i: number): void {
    const t = this.tour()!;
    if (t.steps.length === 1) return;
    t.steps.splice(i, 1);
    this.selected.set(Math.min(this.selected(), t.steps.length - 1));
    this.touch();
  }

  drop(e: CdkDragDrop<unknown>): void {
    moveItemInArray(this.tour()!.steps, e.previousIndex, e.currentIndex);
    this.selected.set(e.currentIndex);
    this.touch();
  }

  /** Server errors for one step, re-keyed relative to it for the step editor. */
  stepErrors(i: number): FieldErrors {
    const prefix = `steps[${i}].`;
    const out: FieldErrors = {};
    for (const [k, v] of Object.entries(this.errors())) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    return out;
  }

  stepHasErrors(i: number): boolean {
    return Object.keys(this.errors()).some((k) => k.startsWith(`steps[${i}]`));
  }

  // ---------- JSON view ----------

  showJson(): void {
    this.jsonText.set(JSON.stringify(this.payload(), null, 2));
    this.jsonError.set('');
    this.tab.set('json');
  }

  applyJson(): boolean {
    try {
      const parsed = JSON.parse(this.jsonText()) as Tour;
      if (!parsed || !Array.isArray(parsed.steps)) throw new Error('A tour needs a "steps" array.');
      const current = this.tour()!;
      parsed.steps.forEach((s) => (s.before ??= []));
      this.tour.set({ ...newTour(), ...parsed, updatedAt: current.updatedAt });
      this.selected.set(0);
      this.jsonError.set('');
      this.touch();
      return true;
    } catch (e) {
      this.jsonError.set((e as Error).message);
      return false;
    }
  }

  showSteps(): void {
    if (this.tab() === 'json' && !this.applyJson()) return;
    this.tab.set('steps');
  }

  // ---------- persistence ----------

  private payload(): Tour {
    return clean(this.tour()!);
  }

  touch(): void {
    this.dirty.set(true);
    this.message.set(null);
  }

  bumpVersion(): void {
    const t = this.tour()!;
    t.version = (t.version ?? 1) + 1;
    this.touch();
  }

  async save(): Promise<void> {
    if (this.tab() === 'json' && !this.applyJson()) return;
    this.saving.set(true);
    this.errors.set({});
    try {
      const body = this.payload();
      const saved = this.isNew()
        ? await this.api.createTour(this.appKey(), body)
        : await this.api.updateTour(this.appKey(), this.originalId, body);
      saved.steps.forEach((s) => (s.before ??= []));
      this.tour.set(saved);
      this.dirty.set(false);
      this.message.set({
        text: saved.isPublished ? 'Saved and live: users get it on their next page load.' : 'Saved as a draft.',
        error: false,
      });
      if (this.isNew() || this.originalId !== saved.id) {
        this.originalId = saved.id;
        await this.router.navigate(['/apps', this.appKey(), 'tours', saved.id], { replaceUrl: true });
      }
    } catch (err) {
      const e = describeError(err);
      this.errors.set(e.fields);
      this.message.set({ text: e.message, error: true });
      const firstBad = Object.keys(e.fields).map((k) => /^steps\[(\d+)\]/.exec(k)?.[1]).find((x) => x !== undefined);
      if (firstBad !== undefined) this.selected.set(Number(firstBad));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!confirm(`Delete the tour "${this.tour()!.title}"? This cannot be undone.`)) return;
    try {
      await this.api.deleteTour(this.appKey(), this.originalId);
      this.dirty.set(false);
      await this.router.navigate(['/apps', this.appKey()]);
    } catch (err) {
      this.message.set({ text: describeError(err).message, error: true });
    }
  }

  previewUrl(): string | null {
    const host = this.app()?.hostUrl;
    const t = this.tour();
    if (!host || !t?.isPublished || this.isNew()) return null;
    const url = new URL(host, location.origin);
    url.searchParams.set('tour', t.id);
    return url.href;
  }

  @HostListener('window:beforeunload', ['$event'])
  warnUnsaved(e: BeforeUnloadEvent): void {
    if (this.dirty()) e.preventDefault();
  }

  @HostListener('window:keydown', ['$event'])
  shortcut(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      void this.save();
    }
  }
}

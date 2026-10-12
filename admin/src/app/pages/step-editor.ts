import { Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ACTION_TYPES, ActionType, FieldErrors, PLACEMENTS, TourAction, TourStep } from '../models';

/**
 * Edits one step in place. The parent owns the tour object; this component
 * mutates the step it is given and the parent tracks dirtiness via DOM events.
 */
@Component({
  selector: 'app-step-editor',
  imports: [FormsModule],
  template: `
    @let s = step();
    <div class="stack">
      <div class="grid-2">
        <label class="field">
          <span>Title</span>
          <input name="title" [(ngModel)]="s.title" />
          @for (m of err('title'); track m) { <small class="error">{{ m }}</small> }
        </label>
        <label class="field">
          <span>Badge <small class="muted">(e.g. New, Step 3)</small></span>
          <input name="badge" [(ngModel)]="s.badge" />
        </label>
      </div>
      <label class="field">
        <span>Description</span>
        <textarea name="body" rows="3" [(ngModel)]="s.body"></textarea>
        @for (m of err('body'); track m) { <small class="error">{{ m }}</small> }
      </label>

      <fieldset data-tour="step-target">
        <legend>What to highlight</legend>
        <div class="grid-2">
          <label class="field">
            <span>Target CSS selector <small class="muted">(empty = centred, no spotlight)</small></span>
            <input name="target" class="mono" [(ngModel)]="s.target" placeholder="#filters, .nav-item[data-view=inbox]" />
            @for (m of err('target'); track m) { <small class="error">{{ m }}</small> }
          </label>
          <label class="field">
            <span>…containing text <small class="muted">(optional)</small></span>
            <input name="targetText" [(ngModel)]="s.targetText" placeholder="Settings" />
          </label>
          <label class="field">
            <span>Tooltip placement</span>
            <select name="placement" [(ngModel)]="s.placement">
              @for (p of placements; track p) { <option [value]="p">{{ p }}</option> }
            </select>
            @for (m of err('placement'); track m) { <small class="error">{{ m }}</small> }
          </label>
          <label class="field">
            <span>Page <small class="muted">(only for multi-page apps)</small></span>
            <input name="page" class="mono" [(ngModel)]="s.page" placeholder="/settings.html" />
            @for (m of err('page'); track m) { <small class="error">{{ m }}</small> }
          </label>
        </div>
        <details>
          <summary class="muted">Advanced</summary>
          <div class="grid-3">
            <label class="field"><span>Spotlight padding (px)</span>
              <input name="padding" type="number" min="0" max="64" [(ngModel)]="s.padding" placeholder="8" /></label>
            <label class="field"><span>Wait for target (ms)</span>
              <input name="timeout" type="number" min="0" max="30000" [(ngModel)]="s.timeout" placeholder="4000" /></label>
            <label class="field"><span>If target is missing</span>
              <select name="onMissing" [(ngModel)]="s.onMissing">
                <option [ngValue]="undefined">skip the step</option>
                <option value="center">show it centred</option>
              </select></label>
          </div>
        </details>
      </fieldset>

      <fieldset data-tour="step-actions">
        <legend>Before highlighting <small class="muted">(navigate, open a modal, switch a tab…)</small></legend>
        <p class="muted small">
          These run in order every time the step is shown, including on Back, so make them safe to repeat:
          use <em>only if</em> to skip an action when the page is already in the right state.
        </p>
        @for (a of s.before ?? []; track $index; let i = $index) {
          <div class="action">
            <div class="action-head">
              <span class="pill">{{ i + 1 }}</span>
              <select [name]="'type' + i" [(ngModel)]="a.type" (ngModelChange)="changeType(a, $event)">
                @for (t of actionTypes; track t.type) { <option [value]="t.type">{{ t.label }}</option> }
              </select>
              <span class="grow"></span>
              <button type="button" class="icon" title="Move up" [disabled]="i === 0" (click)="moveAction(i, -1)">↑</button>
              <button type="button" class="icon" title="Move down" [disabled]="i === s.before!.length - 1" (click)="moveAction(i, 1)">↓</button>
              <button type="button" class="icon danger" title="Remove" (click)="removeAction(i)">✕</button>
            </div>
            <div class="grid-2">
              @for (f of fieldsFor(a.type); track f) {
                <label class="field">
                  <span>{{ labels[f] }}</span>
                  @switch (f) {
                    @case ('timeout') { <input type="number" [name]="f + i" [(ngModel)]="a.timeout" /> }
                    @case ('ms') { <input type="number" [name]="f + i" [(ngModel)]="a.ms" /> }
                    @case ('args') {
                      <input class="mono" [name]="f + i" [ngModel]="toJson(a.args)" (change)="setArgs(a, $any($event.target).value)" placeholder='{"id": "e-ref1"}' />
                    }
                    @default { <input class="mono" [name]="f + i" [(ngModel)]="$any(a)[f]" /> }
                  }
                  @for (m of err('before[' + i + '].' + f); track m) { <small class="error">{{ m }}</small> }
                </label>
              }
            </div>
            <div class="grid-2 when">
              <label class="field"><span>Only if this exists</span>
                <input class="mono" [name]="'wx' + i" [ngModel]="a.when?.exists" (ngModelChange)="setWhen(a, 'exists', $event)" placeholder="(always)" /></label>
              <label class="field"><span>Only if this does not exist</span>
                <input class="mono" [name]="'wn' + i" [ngModel]="a.when?.notExists" (ngModelChange)="setWhen(a, 'notExists', $event)" placeholder="(always)" /></label>
            </div>
            @for (m of err('before[' + i + '].type'); track m) { <small class="error">{{ m }}</small> }
          </div>
        }
        <button type="button" class="btn small" (click)="addAction()">+ Add action</button>
      </fieldset>
    </div>
  `,
})
export class StepEditor {
  step = input.required<TourStep>();
  /** Server validation errors for this step, keyed relative to it ("title", "before[0].url"). */
  errors = input<FieldErrors>({});

  placements = PLACEMENTS;
  actionTypes = ACTION_TYPES;
  labels: Record<string, string> = {
    selector: 'CSS selector', text: '…containing text', url: 'URL or #hash', timeout: 'Timeout (ms)',
    ms: 'Milliseconds', event: 'Event name', name: 'Registered action name', args: 'Arguments (JSON)', value: 'Value',
  };

  private fieldMap = computed(() => new Map(ACTION_TYPES.map((t) => [t.type, t.fields])));

  err(path: string): string[] {
    return this.errors()[path] ?? [];
  }

  fieldsFor(type: ActionType): string[] {
    return (this.fieldMap().get(type) ?? []) as string[];
  }

  addAction(): void {
    const s = this.step();
    s.before = [...(s.before ?? []), { type: 'click', selector: '' }];
  }

  removeAction(i: number): void {
    this.step().before!.splice(i, 1);
  }

  moveAction(i: number, delta: number): void {
    const list = this.step().before!;
    const [a] = list.splice(i, 1);
    list.splice(i + delta, 0, a);
  }

  /** Drop fields that don't apply to the new type, so stored JSON stays clean. */
  changeType(a: TourAction, type: ActionType): void {
    const keep = new Set<string>(['type', 'when', ...this.fieldsFor(type)]);
    for (const k of Object.keys(a)) if (!keep.has(k)) delete (a as unknown as Record<string, unknown>)[k];
  }

  setWhen(a: TourAction, key: 'exists' | 'notExists', value: string): void {
    a.when = { ...a.when, [key]: value || undefined };
  }

  toJson(v: unknown): string {
    return v === undefined ? '' : JSON.stringify(v);
  }

  setArgs(a: TourAction, text: string): void {
    if (!text.trim()) {
      a.args = undefined;
      return;
    }
    try {
      a.args = JSON.parse(text);
    } catch {
      a.args = text; // plain string argument
    }
  }
}

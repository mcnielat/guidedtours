// Mirrors the .NET DTOs (server/GuidedTours.Api/Models) and the engine schema (engine/src/types.ts).

export type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center';
export type AutoStart = 'never' | 'firstVisit' | 'always';
export type ActionType = 'click' | 'navigate' | 'waitFor' | 'delay' | 'dispatch' | 'call' | 'setValue';

export interface TourCondition {
  exists?: string;
  notExists?: string;
}

export interface TourAction {
  type: ActionType;
  selector?: string;
  text?: string;
  url?: string;
  timeout?: number;
  ms?: number;
  event?: string;
  detail?: unknown;
  name?: string;
  args?: unknown;
  value?: string;
  when?: TourCondition;
}

export interface TourStep {
  id?: string;
  page?: string;
  target?: string;
  targetText?: string;
  title: string;
  body: string;
  badge?: string;
  placement?: Placement;
  padding?: number;
  before?: TourAction[];
  timeout?: number;
  onMissing?: 'skip' | 'center';
}

export interface Tour {
  id: string;
  title: string;
  description?: string;
  version: number;
  autoStart: AutoStart;
  showInChooser: boolean;
  finishLabel?: string;
  isPublished: boolean;
  sortOrder: number;
  updatedAt?: string;
  steps: TourStep[];
}

export interface App {
  key: string;
  name: string;
  chooserTitle?: string;
  chooserSubtitle?: string;
  accentColor?: string;
  hostUrl?: string;
  tourCount?: number;
}

/** ASP.NET ValidationProblem: field path -> messages. */
export type FieldErrors = Record<string, string[]>;

export const PLACEMENTS: Placement[] = ['auto', 'top', 'bottom', 'left', 'right', 'center'];
export const AUTO_STARTS: { value: AutoStart; label: string }[] = [
  { value: 'never', label: 'Never (trigger only)' },
  { value: 'firstVisit', label: 'First visit (and after a version bump)' },
  { value: 'always', label: 'Every page load' },
];

/** What each action type needs; drives the action editor form. */
export const ACTION_TYPES: { type: ActionType; label: string; fields: (keyof TourAction)[] }[] = [
  { type: 'click', label: 'Click an element', fields: ['selector', 'text'] },
  { type: 'navigate', label: 'Go to a URL / hash', fields: ['url'] },
  { type: 'waitFor', label: 'Wait for an element', fields: ['selector', 'timeout'] },
  { type: 'delay', label: 'Pause (ms)', fields: ['ms'] },
  { type: 'setValue', label: 'Fill a field', fields: ['selector', 'value'] },
  { type: 'dispatch', label: 'Fire a DOM event', fields: ['event', 'selector'] },
  { type: 'call', label: 'Call a host action', fields: ['name', 'args'] },
];

export function newStep(): TourStep {
  return { title: 'New step', body: 'Describe what the user is looking at.', placement: 'auto', before: [] };
}

export function newTour(): Tour {
  return {
    id: '',
    title: '',
    version: 1,
    autoStart: 'never',
    showInChooser: true,
    isPublished: false,
    sortOrder: 0,
    steps: [newStep()],
  };
}

/** Drop empty strings and empty arrays so stored JSON stays minimal and readable. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === '' || v === null || v === undefined) continue;
      const c = clean(v);
      if (k !== 'steps' && Array.isArray(c) && c.length === 0) continue;
      if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0) continue;
      out[k] = c;
    }
    return out as T;
  }
  return value;
}

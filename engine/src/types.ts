/**
 * The config schema. Everything a tour needs is expressed here as plain data,
 * so tours can be stored and edited in the backend and shipped as JSON.
 * Keep in sync with /schema/tour.schema.json and the .NET models.
 */

export type Placement = "auto" | "top" | "bottom" | "left" | "right" | "center";

export type AutoStart = "never" | "firstVisit" | "always";

/** Guard that lets an action run only when the page is (or isn't) in a given state. */
export interface Condition {
  /** Run only if this selector matches a visible element. */
  exists?: string;
  /** Run only if this selector matches no visible element. */
  notExists?: string;
}

interface ActionBase {
  when?: Condition;
}

/** Click an element (nav item, tab, button that opens a modal or side panel). */
export interface ClickAction extends ActionBase {
  type: "click";
  selector: string;
  /** Narrow the match to the element whose text contains this string. */
  text?: string;
}

/** Change the URL on the current page: a hash (#inbox) or a same-origin URL via pushState. */
export interface NavigateAction extends ActionBase {
  type: "navigate";
  url: string;
}

/** Wait until an element is visible. */
export interface WaitForAction extends ActionBase {
  type: "waitFor";
  selector: string;
  timeout?: number;
}

/** Fixed pause, e.g. for a CSS transition. Prefer waitFor where possible. */
export interface DelayAction extends ActionBase {
  type: "delay";
  ms: number;
}

/** Fire a DOM CustomEvent the host app can listen to. */
export interface DispatchAction extends ActionBase {
  type: "dispatch";
  event: string;
  selector?: string;
  detail?: unknown;
}

/** Invoke a handler the host registered with Tour.registerAction(name, fn). No eval, ever. */
export interface CallAction extends ActionBase {
  type: "call";
  name: string;
  args?: unknown;
}

/** Set a form field's value and fire input/change events. */
export interface SetValueAction extends ActionBase {
  type: "setValue";
  selector: string;
  value: string;
}

export type TourAction =
  | ClickAction
  | NavigateAction
  | WaitForAction
  | DelayAction
  | DispatchAction
  | CallAction
  | SetValueAction;

export interface TourStep {
  id?: string;
  /**
   * The page this step lives on (a pathname such as "/demo/settings.html").
   * If the user is elsewhere, the engine saves its place, navigates there and resumes.
   */
  page?: string;
  /** CSS selector of the element to spotlight. Omit for a centred, untargeted step. */
  target?: string;
  /** Narrow the target to the match whose text contains this string. */
  targetText?: string;
  title: string;
  body: string;
  badge?: string;
  placement?: Placement;
  /** Extra space around the spotlight, in px. */
  padding?: number;
  /** Actions that bring the target on screen. Re-run on Back, so keep them idempotent (use `when`). */
  before?: TourAction[];
  /** How long to wait for the target to appear, in ms. */
  timeout?: number;
  /** If the target never appears: skip the step (default) or show it centred. */
  onMissing?: "skip" | "center";
}

export interface TourConfig {
  id: string;
  title: string;
  description?: string;
  /** Bump to show the tour again to users who already completed or skipped it. */
  version?: number;
  autoStart?: AutoStart;
  /** List this tour in the chooser. Default true. */
  showInChooser?: boolean;
  /** Text for the last button. Default "Finish". */
  finishLabel?: string;
  steps: TourStep[];
}

export interface ChooserConfig {
  title?: string;
  subtitle?: string;
}

export interface ThemeConfig {
  accent?: string;
  zIndex?: number;
}

/** The payload the backend returns for one app. */
export interface AppToursPayload {
  app?: { key: string; name?: string; chooser?: ChooserConfig; theme?: ThemeConfig };
  tours: TourConfig[];
}

export type EndReason = "completed" | "skipped";

export interface TourProgress {
  status: EndReason;
  version: number;
  at: string;
}

/** Pluggable persistence for "seen" state. Defaults to localStorage. */
export interface ProgressStore {
  get(tourId: string): TourProgress | null;
  set(tourId: string, progress: TourProgress): void;
  clear(tourId?: string): void;
}

export interface InitOptions {
  /** App key; scopes the config request and the stored progress. */
  app?: string;
  /** Base URL of the tours API. Config is fetched from {api}/api/public/apps/{app}/tours. */
  api?: string;
  /** Inline tours, used instead of (or as well as) the API. */
  tours?: TourConfig[];
  chooser?: ChooserConfig;
  theme?: ThemeConfig;
  store?: ProgressStore;
  /** Wire [data-tour-start] / [data-tour-chooser] elements automatically. Default true. */
  declarativeTriggers?: boolean;
  /** Default wait for targets, in ms. */
  timeout?: number;
}

export type TourEvent = "ready" | "start" | "step" | "end" | "error";

export interface TourEventDetail {
  tourId?: string;
  stepIndex?: number;
  reason?: EndReason;
  error?: unknown;
}

export type ActionHandler = (args: unknown, ctx: { tourId: string; stepIndex: number }) => void | Promise<void>;

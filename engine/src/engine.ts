import { runActions } from "./actions";
import { ensureInView, isCurrentPage, sameOriginUrl, waitFor } from "./dom";
import { localProgressStore, saveResume, takeResume } from "./storage";
import type {
  ActionHandler,
  AppToursPayload,
  ChooserConfig,
  EndReason,
  InitOptions,
  ProgressStore,
  TourConfig,
  TourEvent,
  TourEventDetail,
  TourProgress,
} from "./types";
import { TourUi } from "./ui";

const DEFAULT_TIMEOUT = 4000;
const AUTOSTART_DELAY = 700;

interface ActiveRun {
  tour: TourConfig;
  index: number;
  direction: 1 | -1;
  target: HTMLElement | null;
  abort: AbortController;
}

type Listener = (detail: TourEventDetail) => void;

export class GuidedTourEngine {
  private tours = new Map<string, TourConfig>();
  private handlers = new Map<string, ActionHandler>();
  private listeners = new Map<TourEvent, Set<Listener>>();
  private opts: InitOptions = {};
  private app = "default";
  private store: ProgressStore = localProgressStore(this.app);
  private chooserCfg: ChooserConfig = {};
  private ui: TourUi | null = null;
  private run: ActiveRun | null = null;
  private initialised = false;
  private readyResolve!: () => void;
  /** Resolves once config has loaded; start() calls made earlier wait on it. */
  readonly ready: Promise<void> = new Promise((r) => (this.readyResolve = r));
  private relayoutFrame = 0;
  private resizeObserver: ResizeObserver | null = null;

  // ---------- public API ----------

  async init(options: InitOptions = {}): Promise<void> {
    if (this.initialised) return this.ready;
    this.initialised = true;
    this.opts = options;
    this.app = options.app ?? "default";
    this.store = options.store ?? localProgressStore(this.app);
    this.chooserCfg = options.chooser ?? {};
    this.applyTheme(options.theme);

    if (options.tours) this.register(options.tours);
    if (options.api) await this.load(options.api);
    if (options.declarativeTriggers !== false) this.bindDeclarativeTriggers();
    this.bindGlobalListeners();

    this.readyResolve();
    this.emit("ready", {});
    this.startupFlow();
  }

  /** Add or replace tours. Invalid ones are skipped with a console warning. */
  register(config: TourConfig | TourConfig[]): void {
    for (const t of Array.isArray(config) ? config : [config]) {
      if (!t || typeof t.id !== "string" || !Array.isArray(t.steps) || t.steps.length === 0) {
        console.warn("[GuidedTour] ignoring invalid tour config", t);
        continue;
      }
      this.tours.set(t.id, t);
    }
  }

  registerAction(name: string, handler: ActionHandler): void {
    this.handlers.set(name, handler);
  }

  async start(tourId: string, opts: { step?: number } = {}): Promise<boolean> {
    if (!this.tours.has(tourId)) await this.ready;
    const tour = this.tours.get(tourId);
    if (!tour) {
      console.warn(`[GuidedTour] unknown tour "${tourId}"`);
      this.emit("error", { tourId, error: new Error("unknown tour") });
      return false;
    }
    this.ui?.closeChooser(false);
    if (this.run) this.teardownRun();
    this.run = { tour, index: -1, direction: 1, target: null, abort: new AbortController() };
    this.emit("start", { tourId });
    void this.goTo(opts.step ?? 0, 1);
    return true;
  }

  next(): void {
    const r = this.run;
    if (!r) return;
    if (r.index >= r.tour.steps.length - 1) this.end("completed");
    else void this.goTo(r.index + 1, 1);
  }

  back(): void {
    const r = this.run;
    if (r && r.index > 0) void this.goTo(r.index - 1, -1);
  }

  end(reason: EndReason = "skipped"): void {
    const r = this.run;
    if (!r) return;
    this.store.set(r.tour.id, { status: reason, version: r.tour.version ?? 1, at: new Date().toISOString() });
    this.teardownRun();
    this.ui?.hideTour();
    this.emit("end", { tourId: r.tour.id, stepIndex: r.index, reason });
  }

  /** Open the chooser listing the given tours (default: every tour marked showInChooser). */
  async openChooser(tourIds?: string[]): Promise<void> {
    await this.ready;
    const list = this.chooserTours(tourIds);
    if (list.length === 0) return;
    if (list.length === 1) {
      void this.start(list[0].id);
      return;
    }
    this.getUi().openChooser(this.chooserCfg, list, (id) => this.store.get(id), (id) => void this.start(id));
  }

  /** Forget completion state so auto-start fires again. */
  reset(tourId?: string): void {
    this.store.clear(tourId);
  }

  getTours(): TourConfig[] {
    return Array.from(this.tours.values());
  }

  getProgress(tourId: string): TourProgress | null {
    return this.store.get(tourId);
  }

  isActive(): boolean {
    return this.run !== null;
  }

  /** Subscribe to lifecycle events. Also dispatched on window as `guidedtour:<event>`. */
  on(event: TourEvent, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  // ---------- loading ----------

  private async load(api: string): Promise<void> {
    const url = `${api.replace(/\/+$/, "")}/api/public/apps/${encodeURIComponent(this.app)}/tours`;
    try {
      const res = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const payload = (await res.json()) as AppToursPayload;
      if (payload.app?.chooser) this.chooserCfg = { ...payload.app.chooser, ...this.opts.chooser };
      if (payload.app?.theme) this.applyTheme({ ...payload.app.theme, ...this.opts.theme });
      this.register(payload.tours ?? []);
    } catch (error) {
      console.warn("[GuidedTour] could not load tours", error);
      this.emit("error", { error });
    }
  }

  /** On page load: resume a cross-page tour, honour a ?tour= deep link, or auto-start. */
  private startupFlow(): void {
    const resume = takeResume(this.app);
    if (resume && this.tours.has(resume.tourId)) {
      const tour = this.tours.get(resume.tourId)!;
      this.run = { tour, index: -1, direction: resume.direction, target: null, abort: new AbortController() };
      void this.goTo(resume.stepIndex, resume.direction);
      return;
    }

    const linked = new URLSearchParams(location.search).get("tour") ?? /[#&]tour=([^&]+)/.exec(location.hash)?.[1];
    if (linked && this.tours.has(decodeURIComponent(linked))) {
      void this.start(decodeURIComponent(linked));
      return;
    }

    const eligible = this.getTours().filter((t) => this.shouldAutoStart(t));
    if (eligible.length === 0) return;
    setTimeout(() => {
      if (this.run) return;
      if (eligible.length === 1) {
        void this.start(eligible[0].id);
        return;
      }
      // Several new tours: offer them in the chooser. Dismissing counts as "skipped".
      this.getUi().openChooser(
        this.chooserCfg,
        eligible,
        (id) => this.store.get(id),
        (id) => void this.start(id),
        () => eligible.forEach((t) => this.store.set(t.id, { status: "skipped", version: t.version ?? 1, at: new Date().toISOString() })),
      );
    }, AUTOSTART_DELAY);
  }

  private shouldAutoStart(t: TourConfig): boolean {
    const mode = t.autoStart ?? "never";
    if (mode === "never") return false;
    const first = t.steps[0];
    if (first.page && !isCurrentPage(first.page)) return false;
    if (mode === "always") return true;
    const seen = this.store.get(t.id);
    return !seen || seen.version < (t.version ?? 1);
  }

  private chooserTours(ids?: string[]): TourConfig[] {
    if (ids?.length) return ids.map((id) => this.tours.get(id)).filter((t): t is TourConfig => !!t);
    return this.getTours().filter((t) => t.showInChooser !== false);
  }

  // ---------- running a step ----------

  private async goTo(index: number, direction: 1 | -1): Promise<void> {
    const r = this.run;
    if (!r) return;
    const steps = r.tour.steps;
    if (index >= steps.length) return this.end("completed");
    if (index < 0) index = 0;

    // Cancel whatever the previous step was still doing (user clicked fast).
    r.abort.abort();
    r.abort = new AbortController();
    const { signal } = r.abort;
    this.unwatchTarget();
    r.index = index;
    r.direction = direction;
    r.target = null;

    const step = steps[index];

    // Cross-page handoff: remember where we are, load the other page, resume there.
    if (step.page && !isCurrentPage(step.page)) {
      const url = sameOriginUrl(step.page);
      if (!url) {
        this.emit("error", { tourId: r.tour.id, stepIndex: index, error: new Error(`page "${step.page}" is not same-origin`) });
        return this.skip(index, direction);
      }
      saveResume(this.app, { tourId: r.tour.id, stepIndex: index, direction, at: Date.now() });
      this.ui?.showLoading();
      location.href = url.href;
      return;
    }

    const ui = this.getUi();
    ui.showLoading();
    this.emit("step", { tourId: r.tour.id, stepIndex: index });
    const timeout = step.timeout ?? this.opts.timeout ?? DEFAULT_TIMEOUT;

    try {
      await runActions(step.before, { tourId: r.tour.id, stepIndex: index, timeout, signal, handlers: this.handlers });
    } catch (error) {
      // Keep going: the target may still be reachable. Report so authors can fix the config.
      console.warn(`[GuidedTour] ${r.tour.id} step ${index + 1}:`, error);
      this.emit("error", { tourId: r.tour.id, stepIndex: index, error });
    }
    if (signal.aborted) return;

    let target: HTMLElement | null = null;
    if (step.target) {
      target = await waitFor(step.target, { text: step.targetText, timeout, signal });
      if (signal.aborted) return;
      if (!target && step.onMissing !== "center") {
        console.warn(`[GuidedTour] ${r.tour.id} step ${index + 1}: target "${step.target}" not found, skipping`);
        return this.skip(index, direction);
      }
    }

    if (target) {
      ensureInView(target);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      if (signal.aborted) return;
    }
    r.target = target;

    const last = index === steps.length - 1;
    ui.showStep(
      {
        title: step.title,
        body: step.body,
        badge: step.badge,
        index,
        total: steps.length,
        nextLabel: last ? (r.tour.finishLabel ?? "Finish") : "Next",
      },
      target,
      target ? (step.placement ?? "auto") : "center",
      step.padding ?? 8,
    );
    this.watchTarget(target);
  }

  /** Move past a step whose target is missing, in the direction the user was going. */
  private skip(index: number, direction: 1 | -1): Promise<void> {
    const nextIndex = index + direction;
    if (nextIndex < 0) return this.goTo(index + 1, 1);
    return this.goTo(nextIndex, direction);
  }

  // ---------- layout tracking ----------

  private watchTarget(target: HTMLElement | null): void {
    if (target && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.relayout());
      this.resizeObserver.observe(target);
    }
  }

  private unwatchTarget(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private relayout = (): void => {
    if (!this.run || !this.ui) return;
    cancelAnimationFrame(this.relayoutFrame);
    this.relayoutFrame = requestAnimationFrame(() => {
      const r = this.run;
      if (!r || r.index < 0) return;
      const step = r.tour.steps[r.index];
      // The target can be re-rendered by the host framework; re-query if it was detached.
      if (r.target && !r.target.isConnected && step.target) {
        r.target = document.querySelector<HTMLElement>(step.target);
      }
      if (step.target && !r.target) return;
      this.ui!.layout(r.target, r.target ? (step.placement ?? "auto") : "center", step.padding ?? 8);
    });
  };

  // ---------- wiring ----------

  private bindGlobalListeners(): void {
    window.addEventListener("resize", this.relayout);
    window.addEventListener("scroll", this.relayout, true);
    window.addEventListener(
      "keydown",
      (e) => {
        if (!this.run || e.defaultPrevented) return;
        if (e.key === "Escape") {
          e.stopPropagation(); // don't let the host close its own modal underneath us
          this.end("skipped");
        } else if (e.key === "ArrowRight") this.next();
        else if (e.key === "ArrowLeft") this.back();
      },
      true,
    );
  }

  /**
   * Any element with data-tour-start="id" starts that tour; data-tour-chooser
   * (optionally ="id1,id2") opens the chooser. Delegated on document, so it works
   * for buttons a framework renders later.
   */
  private bindDeclarativeTriggers(): void {
    document.addEventListener("click", (e) => {
      const el = (e.target as Element | null)?.closest?.("[data-tour-start],[data-tour-chooser]");
      if (!el) return;
      e.preventDefault();
      const id = el.getAttribute("data-tour-start");
      if (id) {
        void this.start(id);
        return;
      }
      const ids = (el.getAttribute("data-tour-chooser") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      void this.openChooser(ids);
    });
  }

  private applyTheme(theme?: InitOptions["theme"]): void {
    if (!theme) return;
    if (theme.accent) document.documentElement.style.setProperty("--gt-accent", theme.accent);
    if (theme.zIndex && this.ui) this.ui.element.style.zIndex = String(theme.zIndex);
  }

  private getUi(): TourUi {
    if (!this.ui) {
      this.ui = new TourUi({ next: () => this.next(), back: () => this.back(), end: () => this.end("skipped") }, this.opts.theme?.zIndex);
    }
    return this.ui;
  }

  private teardownRun(): void {
    this.run?.abort.abort();
    this.unwatchTarget();
    this.run = null;
  }

  private emit(event: TourEvent, detail: TourEventDetail): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.error("[GuidedTour] listener error", err);
      }
    });
    window.dispatchEvent(new CustomEvent(`guidedtour:${event}`, { detail }));
  }
}

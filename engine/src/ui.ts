import { computePosition, spotlightRect, type Rect } from "./position";
import { CSS } from "./styles";
import type { ChooserConfig, Placement, TourConfig, TourProgress } from "./types";

export interface StepView {
  title: string;
  body: string;
  badge?: string;
  index: number;
  total: number;
  nextLabel: string;
}

export interface UiHandlers {
  next(): void;
  back(): void;
  end(): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Owns every DOM node the engine draws: overlay, spotlight ring, tooltip, chooser. */
export class TourUi {
  private host = h("div", undefined, { "data-guided-tour": "" });
  private root = this.host.attachShadow({ mode: "open" });
  private blocker = h("div", "blocker");
  private ring = h("div", "ring");
  private pop = h("div", "pop", { role: "dialog", "aria-modal": "true", "aria-labelledby": "gt-title", "aria-describedby": "gt-body", tabindex: "-1" });
  private badge = h("span", "badge");
  private title = h("h2", "title", { id: "gt-title", "aria-live": "polite" });
  private body = h("p", "body", { id: "gt-body" });
  private count = h("span", "count");
  private skipBtn = h("button", "skip", { type: "button" });
  private backBtn = h("button", "back", { type: "button" });
  private nextBtn = h("button", "next", { type: "button" });
  private closeBtn = h("button", "x", { type: "button", "aria-label": "Close tour" });
  private arrow = h("span", "arrow", { "aria-hidden": "true" });
  private chooser: HTMLElement | null = null;
  private lastFocus: Element | null = null;

  constructor(private handlers: UiHandlers, zIndex = 2147483000) {
    const style = h("style");
    style.textContent = CSS;
    this.host.style.cssText = `position:fixed;inset:0;z-index:${zIndex};pointer-events:none;`;
    for (const el of [this.blocker, this.ring, this.pop]) el.style.pointerEvents = "auto";
    this.ring.style.pointerEvents = "none";

    this.skipBtn.textContent = "Skip tour";
    this.backBtn.textContent = "Back";
    this.closeBtn.textContent = "×";
    const btns = h("div", "btns");
    btns.append(this.skipBtn, this.backBtn, this.nextBtn);
    const foot = h("div", "foot");
    foot.append(this.count, btns);
    this.pop.append(this.closeBtn, this.badge, this.title, this.body, foot, this.arrow);
    this.root.append(style, this.blocker, this.ring, this.pop);

    this.nextBtn.addEventListener("click", () => this.handlers.next());
    this.backBtn.addEventListener("click", () => this.handlers.back());
    this.skipBtn.addEventListener("click", () => this.handlers.end());
    this.closeBtn.addEventListener("click", () => this.handlers.end());
    this.pop.addEventListener("keydown", (e) => this.trapFocus(e, this.pop));
    this.hideAll();
  }

  mount(): void {
    if (!this.host.isConnected) document.body.appendChild(this.host);
  }

  get element(): HTMLElement {
    return this.host;
  }

  isOpen(): boolean {
    return this.host.isConnected && !this.blocker.hidden;
  }

  /** Show the overlay with the tooltip hidden while a step's actions run. */
  showLoading(): void {
    this.mount();
    if (!this.lastFocus) this.lastFocus = document.activeElement;
    this.blocker.hidden = false;
    this.pop.hidden = false;
    this.pop.classList.add("loading");
  }

  showStep(view: StepView, target: HTMLElement | null, placement: Placement, padding: number): void {
    this.badge.hidden = !view.badge;
    this.badge.textContent = view.badge ?? "";
    this.title.textContent = view.title;
    this.body.textContent = view.body; // textContent: config text is never parsed as HTML
    this.count.textContent = `${view.index + 1} of ${view.total}`;
    this.nextBtn.textContent = view.nextLabel;
    this.backBtn.style.visibility = view.index === 0 ? "hidden" : "visible";
    this.pop.classList.remove("loading");
    this.layout(target, placement, padding);
    this.nextBtn.focus({ preventScroll: true });
  }

  /** Recompute spotlight and tooltip geometry; called on scroll, resize and target resize. */
  layout(target: HTMLElement | null, placement: Placement, padding: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let rect: Rect | null = null;
    if (target) {
      const r = target.getBoundingClientRect();
      rect = spotlightRect({ left: r.left, top: r.top, width: r.width, height: r.height }, padding, vw, vh);
    }

    // With a target the ring's box-shadow does the dimming; without one the blocker dims.
    this.blocker.classList.toggle("dim", !rect);
    this.ring.hidden = !rect;
    if (rect) {
      Object.assign(this.ring.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }

    const pos = computePosition(rect, this.pop.offsetWidth, this.pop.offsetHeight, vw, vh, placement);
    this.pop.style.left = `${pos.left}px`;
    this.pop.style.top = `${pos.top}px`;
    this.arrow.hidden = !pos.side;
    this.arrow.className = `arrow${pos.side ? ` on-${pos.side}` : ""}`;
    this.arrow.style.left = this.arrow.style.top = "";
    if (pos.side === "top" || pos.side === "bottom") this.arrow.style.left = `${pos.arrowOffset - 7}px`;
    else if (pos.side) this.arrow.style.top = `${pos.arrowOffset - 7}px`;
  }

  hideTour(): void {
    this.blocker.hidden = true;
    this.ring.hidden = true;
    this.pop.hidden = true;
    this.restoreFocus();
  }

  hideAll(): void {
    this.hideTour();
    this.closeChooser();
  }

  openChooser(
    cfg: ChooserConfig,
    tours: TourConfig[],
    progress: (id: string) => TourProgress | null,
    pick: (id: string) => void,
    onDismiss?: () => void,
  ): void {
    this.closeChooser();
    const dismiss = () => {
      this.closeChooser();
      onDismiss?.();
    };
    this.mount();
    if (!this.lastFocus) this.lastFocus = document.activeElement;

    const overlay = h("div", "chooser");
    overlay.style.pointerEvents = "auto";
    const card = h("div", "card", { role: "dialog", "aria-modal": "true", "aria-labelledby": "gt-ch-title" });
    const x = h("button", "x", { type: "button", "aria-label": "Close" });
    x.textContent = "×";
    const title = h("h3", undefined, { id: "gt-ch-title" });
    title.textContent = cfg.title ?? "What's new";
    card.append(x, title);
    if (cfg.subtitle) {
      const sub = h("p", "sub");
      sub.textContent = cfg.subtitle;
      card.append(sub);
    }
    for (const t of tours) {
      const opt = h("button", "opt", { type: "button" });
      const txt = h("span");
      const tt = h("span", "opt-t");
      tt.textContent = t.title;
      txt.append(tt);
      if (t.description) {
        const d = h("span", "opt-d");
        d.textContent = t.description;
        txt.append(d);
      }
      const meta = h("span", "opt-s");
      meta.textContent = progress(t.id)?.status === "completed" ? "✓ Seen" : `${t.steps.length} steps`;
      opt.append(txt, meta);
      opt.addEventListener("click", () => {
        this.closeChooser(false);
        pick(t.id);
      });
      card.append(opt);
    }
    overlay.append(card);
    overlay.addEventListener("click", (e) => e.target === overlay && dismiss());
    x.addEventListener("click", dismiss);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
      this.trapFocus(e, card);
    });
    this.root.append(overlay);
    this.chooser = overlay;
    (card.querySelector(".opt") as HTMLElement | null)?.focus();
  }

  closeChooser(restore = true): void {
    this.chooser?.remove();
    this.chooser = null;
    if (restore && !this.isOpen()) this.restoreFocus();
  }

  destroy(): void {
    this.host.remove();
  }

  private restoreFocus(): void {
    const f = this.lastFocus as HTMLElement | null;
    this.lastFocus = null;
    if (f && typeof f.focus === "function" && f.isConnected) f.focus({ preventScroll: true });
  }

  private trapFocus(e: KeyboardEvent, container: HTMLElement): void {
    if (e.key !== "Tab") return;
    const items = Array.from(container.querySelectorAll<HTMLElement>("button")).filter((b) => b.style.visibility !== "hidden");
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.root.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/** DOM helpers shared by the runtime and actions. */

export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
  if ((el as HTMLElement).hidden || el.closest("[hidden]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

/** First visible element matching the selector, optionally whose text contains `text`. */
export function query(selector: string, text?: string): HTMLElement | null {
  let nodes: Element[];
  try {
    nodes = Array.from(document.querySelectorAll(selector));
  } catch {
    return null; // invalid selector in config: treat as "not found"
  }
  const needle = text?.trim().toLowerCase();
  for (const n of nodes) {
    if (needle && !(n.textContent ?? "").toLowerCase().includes(needle)) continue;
    if (isVisible(n)) return n as HTMLElement;
  }
  return null;
}

/**
 * Resolve once a visible match exists. Watches DOM mutations and also polls on
 * animation frames, because visibility often changes through CSS without a mutation.
 */
export function waitFor(
  selector: string,
  opts: { text?: string; timeout: number; signal: AbortSignal },
): Promise<HTMLElement | null> {
  const found = query(selector, opts.text);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    let raf = 0;
    const done = (el: HTMLElement | null) => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      opts.signal.removeEventListener("abort", onAbort);
      resolve(el);
    };
    const check = () => {
      const el = query(selector, opts.text);
      if (el) done(el);
    };
    const tick = () => {
      check();
      raf = requestAnimationFrame(tick);
    };
    const onAbort = () => done(null);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => done(null), opts.timeout);
    opts.signal.addEventListener("abort", onAbort);
    raf = requestAnimationFrame(tick);
  });
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Scroll the target into view only if it isn't already fully visible. */
export function ensureInView(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const fits = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  if (!fits) el.scrollIntoView({ block: r.height > window.innerHeight ? "start" : "center", inline: "nearest" });
}

/** Does `page` (a pathname from the config) refer to the current page? */
export function isCurrentPage(page: string): boolean {
  const target = new URL(page, location.href);
  return normalisePath(target.pathname) === normalisePath(location.pathname);
}

function normalisePath(p: string): string {
  return p.replace(/\/index\.html?$/, "/").replace(/\/+$/, "") || "/";
}

/** Only allow navigation within the host app's own origin. */
export function sameOriginUrl(url: string): URL | null {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin ? u : null;
  } catch {
    return null;
  }
}

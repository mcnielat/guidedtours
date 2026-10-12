import { isVisible, query, sameOriginUrl, sleep, waitFor } from "./dom";
import type { ActionHandler, Condition, TourAction } from "./types";

export interface ActionContext {
  tourId: string;
  stepIndex: number;
  timeout: number;
  signal: AbortSignal;
  handlers: Map<string, ActionHandler>;
}

function conditionHolds(c: Condition | undefined): boolean {
  if (!c) return true;
  const visible = (sel: string) => {
    try {
      return Array.from(document.querySelectorAll(sel)).some(isVisible);
    } catch {
      return false;
    }
  };
  if (c.exists && !visible(c.exists)) return false;
  if (c.notExists && visible(c.notExists)) return false;
  return true;
}

/** Short settle after any action that changes the UI, so frameworks can render. */
const SETTLE_MS = 60;

/**
 * Run a step's `before` actions in order. Every action type is a fixed, known
 * operation: config can describe what to do but can never inject code.
 */
export async function runActions(actions: TourAction[] | undefined, ctx: ActionContext): Promise<void> {
  for (const action of actions ?? []) {
    if (ctx.signal.aborted) return;
    if (!conditionHolds(action.when)) continue;

    switch (action.type) {
      case "click": {
        const el = await waitFor(action.selector, { text: action.text, timeout: ctx.timeout, signal: ctx.signal });
        if (!el) throw new Error(`click: no visible element for "${action.selector}"`);
        el.click();
        await sleep(SETTLE_MS, ctx.signal);
        break;
      }
      case "navigate": {
        const url = sameOriginUrl(action.url);
        if (!url) throw new Error(`navigate: "${action.url}" is not same-origin`);
        if (url.pathname === location.pathname && url.search === location.search) {
          if (location.hash !== url.hash) location.hash = url.hash;
        } else {
          history.pushState(null, "", url.href);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        await sleep(SETTLE_MS, ctx.signal);
        break;
      }
      case "waitFor": {
        const el = await waitFor(action.selector, { timeout: action.timeout ?? ctx.timeout, signal: ctx.signal });
        if (!el && !ctx.signal.aborted) throw new Error(`waitFor: "${action.selector}" did not appear`);
        break;
      }
      case "delay":
        await sleep(Math.min(Math.max(action.ms, 0), 10_000), ctx.signal);
        break;
      case "dispatch": {
        const target = action.selector ? query(action.selector) : document;
        (target ?? document).dispatchEvent(new CustomEvent(action.event, { bubbles: true, detail: action.detail }));
        await sleep(SETTLE_MS, ctx.signal);
        break;
      }
      case "call": {
        const handler = ctx.handlers.get(action.name);
        if (!handler) throw new Error(`call: no action registered as "${action.name}"`);
        await handler(action.args, { tourId: ctx.tourId, stepIndex: ctx.stepIndex });
        await sleep(SETTLE_MS, ctx.signal);
        break;
      }
      case "setValue": {
        const el = query(action.selector) as HTMLInputElement | null;
        if (!el) throw new Error(`setValue: no element for "${action.selector}"`);
        el.value = action.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
      default:
        throw new Error(`unknown action type "${(action as { type: string }).type}"`);
    }
  }
}

import type { Placement } from "./types";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "left" | "right";

export interface TooltipPosition {
  left: number;
  top: number;
  /** Which side of the target the tooltip ended up on; null when centred / overlapping. */
  side: Side | null;
  /** Arrow offset along the tooltip edge, in px. */
  arrowOffset: number;
}

const GAP = 14; // distance between spotlight and tooltip
const EDGE = 12; // minimum distance to the viewport edge
const ARROW_INSET = 18;

/**
 * Place a tooltip of size (w, h) next to `target` inside a (vw, vh) viewport.
 * Tries the preferred side, then the opposite, then the remaining sides; if
 * nothing fits (e.g. the target is a full-screen modal) it sits inside the
 * target's bottom edge, clamped to the viewport, with no arrow.
 */
export function computePosition(
  target: Rect | null,
  w: number,
  h: number,
  vw: number,
  vh: number,
  preferred: Placement = "auto",
): TooltipPosition {
  if (!target || preferred === "center") {
    return { left: (vw - w) / 2, top: (vh - h) / 2, side: null, arrowOffset: 0 };
  }

  const space: Record<Side, number> = {
    top: target.top - GAP - EDGE,
    bottom: vh - (target.top + target.height) - GAP - EDGE,
    left: target.left - GAP - EDGE,
    right: vw - (target.left + target.width) - GAP - EDGE,
  };
  const fits = (s: Side) => (s === "top" || s === "bottom" ? space[s] >= h : space[s] >= w);

  const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const bySpace = (Object.keys(space) as Side[]).sort((a, b) => space[b] - space[a]);
  const order: Side[] =
    preferred === "auto" ? bySpace : [preferred, opposite[preferred], ...bySpace.filter((s) => s !== preferred && s !== opposite[preferred])];

  const side = order.find(fits);
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - w - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - h - EDGE));
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;

  if (!side) {
    const left = clampX(cx - w / 2);
    const top = clampY(Math.min(target.top + target.height, vh) - h - GAP);
    return { left, top, side: null, arrowOffset: 0 };
  }

  let left: number;
  let top: number;
  if (side === "top" || side === "bottom") {
    left = clampX(cx - w / 2);
    top = side === "top" ? target.top - GAP - h : target.top + target.height + GAP;
  } else {
    top = clampY(cy - h / 2);
    left = side === "left" ? target.left - GAP - w : target.left + target.width + GAP;
  }

  const arrowOffset =
    side === "top" || side === "bottom"
      ? Math.max(ARROW_INSET, Math.min(w - ARROW_INSET, cx - left))
      : Math.max(ARROW_INSET, Math.min(h - ARROW_INSET, cy - top));

  return { left, top, side, arrowOffset };
}

/** Grow a rect by `pad` and clip it to the viewport so a huge target still shows a visible ring. */
export function spotlightRect(r: Rect, pad: number, vw: number, vh: number): Rect {
  const left = Math.max(r.left - pad, 2);
  const top = Math.max(r.top - pad, 2);
  const right = Math.min(r.left + r.width + pad, vw - 2);
  const bottom = Math.min(r.top + r.height + pad, vh - 2);
  return { left, top, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

import { describe, expect, it } from "vitest";
import { computePosition, spotlightRect } from "../src/position";

const VW = 1280;
const VH = 800;
const W = 330;
const H = 160;

describe("computePosition", () => {
  it("uses the preferred side when it fits", () => {
    const p = computePosition({ left: 20, top: 100, width: 200, height: 40 }, W, H, VW, VH, "right");
    expect(p.side).toBe("right");
    expect(p.left).toBe(20 + 200 + 14);
  });

  it("flips to the opposite side when the preferred one has no room", () => {
    const p = computePosition({ left: 400, top: 20, width: 200, height: 40 }, W, H, VW, VH, "top");
    expect(p.side).toBe("bottom");
  });

  it("auto picks the side with the most space", () => {
    const p = computePosition({ left: 1000, top: 300, width: 200, height: 40 }, W, H, VW, VH, "auto");
    expect(p.side).toBe("left");
  });

  it("keeps the tooltip inside the viewport", () => {
    const p = computePosition({ left: 1240, top: 760, width: 30, height: 30 }, W, H, VW, VH, "bottom");
    expect(p.left + W).toBeLessThanOrEqual(VW - 12);
    expect(p.top).toBeGreaterThanOrEqual(12);
  });

  it("points the arrow at the target centre", () => {
    const target = { left: 600, top: 100, width: 40, height: 40 };
    const p = computePosition(target, W, H, VW, VH, "bottom");
    expect(p.left + p.arrowOffset).toBeCloseTo(620);
  });

  it("overlaps a target that fills the screen, without an arrow", () => {
    const p = computePosition({ left: 0, top: 0, width: VW, height: VH }, W, H, VW, VH, "auto");
    expect(p.side).toBeNull();
    expect(p.top + H).toBeLessThanOrEqual(VH);
  });

  it("centres untargeted steps", () => {
    const p = computePosition(null, W, H, VW, VH);
    expect(p).toMatchObject({ left: (VW - W) / 2, top: (VH - H) / 2, side: null });
  });
});

describe("spotlightRect", () => {
  it("pads the target", () => {
    expect(spotlightRect({ left: 100, top: 100, width: 50, height: 20 }, 8, VW, VH)).toEqual({ left: 92, top: 92, width: 66, height: 36 });
  });

  it("clips to the viewport so huge targets still show a ring", () => {
    const r = spotlightRect({ left: -50, top: -50, width: 2000, height: 2000 }, 8, VW, VH);
    expect(r).toEqual({ left: 2, top: 2, width: VW - 4, height: VH - 4 });
  });
});

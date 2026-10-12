import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTourEngine } from "../src/engine";
import type { TourConfig } from "../src/types";

// jsdom has no layout: give every element a non-zero box so it counts as visible.
beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 10, top: 10, width: 100, height: 30, right: 110, bottom: 40, x: 10, y: 10, toJSON: () => ({}),
  } as DOMRect);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

const shadow = () => document.querySelector("[data-guided-tour]")!.shadowRoot!;
const text = (sel: string) => shadow().querySelector(sel)!.textContent;
const settle = () => new Promise((r) => setTimeout(r, 120));

function tour(overrides: Partial<TourConfig> = {}): TourConfig {
  return {
    id: "t1",
    title: "Tour one",
    steps: [
      { target: "#a", title: "Step A", body: "a" },
      { target: "#b", title: "Step B", body: "b", before: [{ type: "click", selector: "#show-b" }] },
      { target: "#c", title: "Step C", body: "c" },
    ],
    ...overrides,
  };
}

function page() {
  document.body.innerHTML = `
    <div id="a">A</div>
    <button id="show-b">show</button>
    <div id="b" hidden>B</div>
    <div id="c">C</div>
    <button id="trigger" data-tour-start="t1">go</button>`;
  document.getElementById("show-b")!.addEventListener("click", () => (document.getElementById("b")!.hidden = false));
}

describe("GuidedTourEngine", () => {
  it("runs steps in order, running actions so targets exist", async () => {
    page();
    const engine = new GuidedTourEngine();
    await engine.init({ app: "test", tours: [tour()] });
    await engine.start("t1");
    await settle();
    expect(text(".title")).toBe("Step A");
    expect(text(".count")).toBe("1 of 3");

    engine.next();
    await settle();
    expect(document.getElementById("b")!.hidden).toBe(false);
    expect(text(".title")).toBe("Step B");

    engine.next();
    await settle();
    expect(text(".next")).toBe("Finish");
    engine.next();
    expect(engine.isActive()).toBe(false);
    expect(engine.getProgress("t1")?.status).toBe("completed");
  });

  it("skips a step whose target never appears", async () => {
    page();
    const engine = new GuidedTourEngine();
    const t = tour();
    t.steps[1] = { target: "#missing", title: "Ghost", body: "x", timeout: 50 };
    await engine.init({ app: "test", tours: [t] });
    await engine.start("t1");
    await settle();
    engine.next();
    await new Promise((r) => setTimeout(r, 250));
    expect(text(".title")).toBe("Step C");
  });

  it("starts from a declarative data-tour-start trigger", async () => {
    page();
    const engine = new GuidedTourEngine();
    await engine.init({ app: "test", tours: [tour()] });
    document.getElementById("trigger")!.click();
    await settle();
    expect(engine.isActive()).toBe(true);
  });

  it("records skipped when ended early, and auto-starts only once", async () => {
    page();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const engine = new GuidedTourEngine();
    await engine.init({ app: "test", tours: [tour({ autoStart: "firstVisit" })] });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    await settle();
    expect(engine.isActive()).toBe(true);
    engine.end();
    expect(engine.getProgress("t1")?.status).toBe("skipped");

    const again = new GuidedTourEngine();
    await again.init({ app: "test", tours: [tour({ autoStart: "firstVisit" })] });
    await new Promise((r) => setTimeout(r, 800));
    expect(again.isActive()).toBe(false);
  });

  it("auto-starts again when the tour version is bumped", async () => {
    page();
    localStorage.setItem("gt:test:progress:t1", JSON.stringify({ status: "completed", version: 1, at: "" }));
    const engine = new GuidedTourEngine();
    await engine.init({ app: "test", tours: [tour({ autoStart: "firstVisit", version: 2 })] });
    await new Promise((r) => setTimeout(r, 800));
    expect(engine.isActive()).toBe(true);
  });

  it("never renders config text as HTML", async () => {
    page();
    const engine = new GuidedTourEngine();
    await engine.init({ app: "test", tours: [tour({ steps: [{ target: "#a", title: "<img src=x onerror=alert(1)>", body: "b" }] })] });
    await engine.start("t1");
    await settle();
    expect(shadow().querySelector("img")).toBeNull();
    expect(text(".title")).toBe("<img src=x onerror=alert(1)>");
  });

  it("call actions only reach handlers the host registered", async () => {
    page();
    const engine = new GuidedTourEngine();
    const handler = vi.fn();
    engine.registerAction("openThing", handler);
    const errors: unknown[] = [];
    engine.on("error", (d) => errors.push(d.error));
    await engine.init({
      app: "test",
      tours: [tour({ steps: [{ target: "#a", title: "A", body: "a", before: [{ type: "call", name: "openThing", args: { id: 7 } }, { type: "call", name: "notRegistered" }] }] })],
    });
    await engine.start("t1");
    await settle();
    expect(handler).toHaveBeenCalledWith({ id: 7 }, { tourId: "t1", stepIndex: 0 });
    expect(String(errors[0])).toContain("notRegistered");
  });

  it("loads tours from the backend", async () => {
    page();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ app: { key: "x", chooser: { title: "Hi" } }, tours: [tour()] }) });
    vi.stubGlobal("fetch", fetchMock);
    const engine = new GuidedTourEngine();
    await engine.init({ app: "x", api: "https://tours.example.com/" });
    expect(fetchMock).toHaveBeenCalledWith("https://tours.example.com/api/public/apps/x/tours", expect.anything());
    expect(engine.getTours().map((t) => t.id)).toEqual(["t1"]);
    vi.unstubAllGlobals();
  });
});

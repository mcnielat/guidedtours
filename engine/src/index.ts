/**
 * Public entry point.
 *
 * Drop-in usage (no build step in the host app):
 *   <script src="https://tours.example.com/sdk/tour.js" data-app="tasky" defer></script>
 *   <button data-tour-chooser>What's new</button>
 *   <button data-tour-start="email-walkthrough">Email walkthrough</button>
 *
 * Programmatic usage:
 *   Tour.start("email-walkthrough");
 *   Tour.registerAction("openTicket", (args) => app.openTicket(args.id));
 */
import { GuidedTourEngine } from "./engine";

export * from "./types";
export { GuidedTourEngine } from "./engine";

const Tour = new GuidedTourEngine();
export default Tour;

/**
 * Auto-initialise when loaded from a <script data-app="..."> tag.
 * data-api defaults to the origin the script was served from, so serving the
 * SDK from the tours backend needs no further configuration.
 */
function autoInit(): void {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script?.dataset.app) return;
  const { app, api, timeout } = script.dataset;
  const apiBase = api ?? (script.src ? new URL(script.src, location.href).origin : undefined);
  const run = () =>
    void Tour.init({
      app,
      api: apiBase,
      timeout: timeout ? Number(timeout) : undefined,
      declarativeTriggers: script.dataset.triggers !== "off",
    });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

if (typeof document !== "undefined") autoInit();

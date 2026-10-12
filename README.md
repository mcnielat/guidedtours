# Guided Tours

A reusable guided-tour system that works in any web app.

Tours live in a .NET backend as plain JSON. A small JavaScript engine loads them in the browser and runs them. Adding or changing a tour is a data edit, so the frontend never needs a redeploy.

```
 Host app (any stack)                         Guided Tours service (.NET 8)
┌───────────────────────────────┐            ┌──────────────────────────────────────┐
│ <script src=".../sdk/tour.js" │──GET──────▶│ /sdk/tour.js       the engine (23 KB) │
│         data-app="tasky">     │            │                                      │
│                               │──GET──────▶│ /api/public/apps/tasky/tours         │
│ <button data-tour-chooser>    │            │   published tours as JSON            │
│ <button data-tour-start="x">  │            │                                      │
│ Tour.start("x")               │            │ /api/admin/...  CRUD + validation ◀──┼── Angular admin
└───────────────────────────────┘            │ SQLite (EF Core)                     │   (/admin)
                                             └──────────────────────────────────────┘
```

## Getting started

You'll need the .NET 8 SDK, Node 22.12 or newer, and Google Chrome (for the browser tests).

```bash
npm run setup     # install packages
npm run build     # build the engine and the admin
npm start         # runs on http://localhost:5080
```

Then try:

- **http://localhost:5080/demo/app.html**: a copy of the Tasky prototype. On a first visit the tour chooser pops up. You can replay it from **What's new**.
- **http://localhost:5080/admin/**: the admin portal (key: `dev-admin-key`). Edit a tour, save it, and reload the demo to see the change.
- Other demo sites that use the same engine: `plain.html`, `archery.html`, `doctor-reviews.html` and `doctor-booking.html`, all under `/demo/`.

To reset the data, stop the server and delete `server/GuidedTours.Api/tours.db`. It's re-seeded from `Seed/*.json` on the next start.

For admin development, run `cd admin && npx ng serve` and open http://localhost:4200/admin/. It proxies API calls to the server on :5080.

## What's in the repo

| Folder | What it is |
|---|---|
| `engine/` | The tour engine. TypeScript, no dependencies. |
| `schema/` | JSON Schema describing a tour. |
| `server/GuidedTours.Api` | ASP.NET Core 8 API, SQLite database, seed data and demo pages. |
| `admin/` | Angular 21 admin portal for editing tours. |
| `e2e/` | Playwright browser tests. |

## Adding tours to an app

Add one script tag and some buttons:

```html
<script src="https://tours.example.com/sdk/tour.js" data-app="tasky" defer></script>

<button data-tour-chooser>What's new</button>                       <!-- pick from all tours -->
<button data-tour-chooser="overview,email-walkthrough">Tours</button> <!-- pick from a few -->
<button data-tour-start="email-walkthrough">Walkthrough</button>     <!-- start one directly -->
```

That's it. The buttons work even if Angular or React renders them later. You can also drive it from code:

```js
Tour.start("email-walkthrough");
Tour.on("end", ({ tourId, reason }) => console.log(tourId, reason));
Tour.registerAction("openTicket", (args) => app.openTicket(args.id));
```

Adding `?tour=<id>` to any URL opens that tour straight away.

## Writing a tour

A tour is a list of steps. Each step points at an element and can run actions first, such as opening a panel or switching a tab:

```jsonc
{
  "id": "email-walkthrough",
  "title": "Email process walkthrough",
  "version": 1,                    // bump it to show the tour again to everyone
  "autoStart": "firstVisit",       // never | firstVisit | always
  "steps": [
    {
      "target": "#dQuickPanel",    // any CSS selector; leave it out for a centred step
      "title": "Quick actions",
      "body": "Opens the questions for this task's category.",
      "placement": "left",
      "before": [
        { "type": "click", "selector": "#dQuickBtn", "when": { "notExists": "#dQuickPanel" } },
        { "type": "waitFor", "selector": "#dQuickPanel.open" }
      ]
    },
    { "page": "/demo/settings.html", "target": "#categoryList", "title": "Pick a category", "body": "…" }
  ]
}
```

The available actions are `click`, `navigate`, `waitFor`, `delay`, `setValue`, `dispatch` and `call`. The full schema is in `schema/tour.schema.json`. The Tasky tours from the prototype are rebuilt in `server/GuidedTours.Api/Seed/01-tasky-demo.json`.

If several tours are set to start on a first visit, the user gets the chooser. If only one is, it just starts.

## How it works

- **Matches the prototype.** It dims the page and puts a spotlight ring on the target. The tooltip has an arrow, a step counter and Next/Back/Skip buttons. The tooltip flips sides and stays on screen, even on a phone.
- **Waits instead of guessing.** Steps wait for their element to appear rather than relying on fixed timers.
- **Back works properly.** Going back re-runs that step's setup actions, so the screen ends up in the right state.
- **Spans pages.** A step with a `page` loads that page and the tour carries on there. Back works across the page change too.
- **Remembers what you've seen** in localStorage. Bumping a tour's version shows it to everyone again.
- **Handles a broken step.** If an element no longer exists, that step is skipped and the rest of the tour still runs.
- **Safe by default.** Tour text never renders as HTML, navigation stays on the same site, and `call` only runs functions the app registered. A bad tour config can't inject code.
- **Isolated styling.** The UI lives in a Shadow DOM, so the host app's CSS can't break it. You can theme it with CSS variables (`--gt-accent`, `--gt-font`).
- **Changes go live on the next page load.** The tours endpoint uses ETags, so each load costs one cheap 304 response when nothing changed.
- **Protects edits.** The server validates every save and points the admin to the exact field that's wrong. If two people edit the same tour, the second save is rejected rather than overwriting the first.

## Tests

```bash
npm test
```

| Suite | Tests | Covers |
|---|---|---|
| Engine (Vitest) | 17 | Tooltip positioning, step flow, actions, triggers, auto-start, safety checks |
| Backend (xUnit) | 16 | API endpoints, auth, validation, caching, edit conflicts, service rules |
| Browser (Playwright) | 11 | Both prototype tours end to end, cross-page tours, mobile, the admin portal |

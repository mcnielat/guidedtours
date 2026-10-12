import { expect, test, type Page } from "@playwright/test";

// Playwright CSS locators pierce open shadow roots, so we can reach the tour UI directly.
const tour = (page: Page) => ({
  title: page.locator("[data-guided-tour] .title"),
  body: page.locator("[data-guided-tour] .body"),
  count: page.locator("[data-guided-tour] .count"),
  next: page.locator("[data-guided-tour] .next"),
  back: page.locator("[data-guided-tour] .back"),
  skip: page.locator("[data-guided-tour] .skip"),
  ring: page.locator("[data-guided-tour] .ring"),
  pop: page.locator("[data-guided-tour] .pop"),
  chooser: page.locator("[data-guided-tour] .chooser"),
});

const ADMIN = { "X-Admin-Key": "dev-admin-key" };

/** Fresh visit with every tour already marked as seen, so auto-start stays out of the way. */
async function visitAsReturningUser(page: Page, path: string) {
  await page.addInitScript(() => {
    for (const id of ["overview", "email-walkthrough"]) {
      localStorage.setItem(`gt:tasky-demo:progress:${id}`, JSON.stringify({ status: "completed", version: 1, at: "" }));
    }
  });
  await page.goto(path);
  await page.waitForFunction(() => (window as any).Tour?.getTours().length > 0);
}

/** The spotlight ring should surround the target (within padding + tolerance). */
async function expectSpotlightAround(page: Page, selector: string) {
  const t = tour(page);
  await expect(t.ring).toBeVisible();
  await page.waitForTimeout(350); // ring animates between targets
  const ring = (await t.ring.boundingBox())!;
  const target = (await page.locator(selector).first().boundingBox())!;
  expect(ring.x).toBeLessThanOrEqual(target.x + 1);
  expect(ring.y).toBeLessThanOrEqual(target.y + 1);
  expect(ring.x + ring.width).toBeGreaterThanOrEqual(Math.min(target.x + target.width - 1, 1280 - 3));
  expect(ring.y + ring.height).toBeGreaterThanOrEqual(Math.min(target.y + target.height - 1, 800 - 3));
}

test("first visit offers the chooser once; dismissing it is remembered", async ({ page }) => {
  await page.goto("/demo/app.html");
  const t = tour(page);
  await expect(t.chooser).toBeVisible();
  await expect(t.chooser).toContainText("What's new in Tasky");
  await expect(t.chooser.locator(".opt")).toHaveCount(2); // new-task-form has showInChooser: false
  await page.keyboard.press("Escape");
  await expect(t.chooser).toHaveCount(0);

  await page.reload();
  await page.waitForTimeout(1200);
  await expect(t.chooser).toHaveCount(0);

  // ...but the trigger can always replay it.
  await page.click("#whatsNewBtn");
  await expect(t.chooser).toBeVisible();
});

test("overview tour: every kind of element, actions between steps, Finish", async ({ page }) => {
  await visitAsReturningUser(page, "/demo/app.html");
  const t = tour(page);
  await page.click("#whatsNewBtn");
  await t.chooser.getByText("Overview tour").click();

  // Untargeted intro step, centred.
  await expect(t.count).toHaveText("1 of 12");
  await expect(t.title).toHaveText("Welcome to the new Tasky");
  await expect(t.ring).toBeHidden();
  await expect(t.back).toBeHidden();

  const expectations: [string, string][] = [
    ["ADH Inbox", '.nav-item[data-view="inbox"]'], // nav item
    ["Filter anything", ".filter-bar"], // filter bar
    ["Every email is a task", "#ibRows .ib-row"], // table row
    ["One conversation thread", "#dComms"], // after navigating + switching tab
    ["Reply in place", "#dReplyBox"],
    ["Quick actions", "#dQuickPanel"], // side panel opened by the tour
    ["Create a task by hand", "#newTaskModal .modal"], // whole modal
    ["Category drives everything", "#ntCategory"], // single field
    ["Email", "#view-email .email-tabs"],
    ["Medicolegal register", "#view-cases .case-row"],
    ["Reports, reworked", "#reportsKpis"],
  ];
  for (const [i, [title, selector]] of expectations.entries()) {
    await t.next.click();
    await expect(t.title).toHaveText(title);
    await expect(t.count).toHaveText(`${i + 2} of 12`);
    await expectSpotlightAround(page, selector);
  }

  await expect(t.next).toHaveText("Finish");
  await t.next.click();
  await expect(t.pop).toBeHidden();
  const progress = await page.evaluate(() => (window as any).Tour.getProgress("overview"));
  expect(progress.status).toBe("completed");
});

test("Back re-runs the previous step's actions so its target is on screen again", async ({ page }) => {
  await visitAsReturningUser(page, "/demo/app.html");
  const t = tour(page);
  await page.evaluate(() => (window as any).Tour.start("overview", { step: 7 }));
  await expect(t.title).toHaveText("Create a task by hand");
  await expect(page.locator("#newTaskModal")).toBeVisible();

  await t.back.click(); // back into the task detail, side panel open
  await expect(t.title).toHaveText("Quick actions");
  await expect(page.locator("#newTaskModal")).toBeHidden();
  await expectSpotlightAround(page, "#dQuickPanel");

  await page.keyboard.press("ArrowLeft");
  await expect(t.title).toHaveText("Reply in place");
});

test("email walkthrough hands off to the settings page and resumes there, and back again", async ({ page }) => {
  await visitAsReturningUser(page, "/demo/app.html");
  const t = tour(page);
  await page.evaluate(() => (window as any).Tour.start("email-walkthrough", { step: 2 }));
  await expect(t.title).toHaveText("The task, in detail"); // used the host-registered "openTicket" action
  await expect(page).toHaveURL(/#task\/e-ref1/);

  await page.evaluate(() => (window as any).Tour.start("email-walkthrough", { step: 13 }));
  await expect(t.title).toHaveText("Set up the fields");
  await expect(t.count).toHaveText("14 of 16");

  await t.next.click();
  await page.waitForURL(/settings\.html/);
  await expect(t.title).toHaveText("Pick a category");
  await expect(t.count).toHaveText("15 of 16");
  await expectSpotlightAround(page, "#categoryList");

  await t.back.click();
  await page.waitForURL(/app\.html/);
  await expect(t.title).toHaveText("Set up the fields");
});

test("a help button starts one tour directly; Escape ends it", async ({ page }) => {
  await visitAsReturningUser(page, "/demo/app.html");
  const t = tour(page);
  await page.getByText("Help: creating a task").click();
  await expect(t.chooser).toHaveCount(0);
  await expect(t.title).toHaveText("Start here");
  await t.next.click();
  await expect(t.title).toHaveText("A clear title");
  await expectSpotlightAround(page, "#ntTitle");

  await page.keyboard.press("Escape");
  await expect(t.pop).toBeHidden();
  await expect(page.locator("#newTaskModal")).toBeVisible(); // host modal was not closed by our Escape
  const progress = await page.evaluate(() => (window as any).Tour.getProgress("new-task-form"));
  expect(progress.status).toBe("skipped");
});

test("editing a tour in the backend changes it on the next page load (no frontend deploy)", async ({ page, request }) => {
  const url = "/api/admin/apps/acme-billing/tours/billing-basics";
  const original = await (await request.get(url, { headers: ADMIN })).json();
  try {
    const edited = structuredClone(original);
    edited.steps[0].title = "Edited from the backend";
    edited.steps.push({ target: "#paid", title: "A step added as data", body: "No code changed." });
    const put = await request.put(url, { headers: ADMIN, data: edited });
    expect(put.ok()).toBeTruthy();

    await page.goto("/demo/plain.html?tour=billing-basics"); // deep link starts the tour
    const t = tour(page);
    await expect(t.title).toHaveText("Edited from the backend");
    await expect(t.count).toHaveText("1 of 4");
  } finally {
    const current = await (await request.get(url, { headers: ADMIN })).json();
    await request.put(url, { headers: ADMIN, data: { ...original, updatedAt: current.updatedAt } });
  }
});

test("a step whose target is missing is skipped instead of breaking the tour", async ({ page, request }) => {
  const base = "/api/admin/apps/acme-billing/tours";
  await request.delete(`${base}/e2e-missing`, { headers: ADMIN });
  const created = await request.post(base, {
    headers: ADMIN,
    data: {
      id: "e2e-missing", title: "E2E", isPublished: true, showInChooser: false,
      steps: [
        { target: "#outstanding", title: "One", body: "first" },
        { target: "#does-not-exist", title: "Ghost", body: "never shown", timeout: 300 },
        { target: "#overdue", title: "Three", body: "third" },
      ],
    },
  });
  expect(created.status()).toBe(201);
  try {
    await page.goto("/demo/plain.html?tour=e2e-missing");
    const t = tour(page);
    await expect(t.title).toHaveText("One");
    await t.next.click();
    await expect(t.title).toHaveText("Three");
    await t.back.click(); // skipping works backwards too
    await expect(t.title).toHaveText("One");
  } finally {
    await request.delete(`${base}/e2e-missing`, { headers: ADMIN });
  }
});

test("tooltip stays inside the viewport on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/demo/plain.html?tour=billing-basics");
  const t = tour(page);
  for (let i = 0; i < 3; i++) {
    await expect(t.pop).toBeVisible();
    await page.waitForTimeout(250);
    const box = (await t.pop.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(760);
    if (i < 2) await t.next.click();
  }
});

import { expect, test, type Page } from "@playwright/test";

const ADMIN = { "X-Admin-Key": "dev-admin-key" };

async function signIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Admin key").fill("dev-admin-key");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Systems" })).toBeVisible();
}

test("edit a step in the admin and see it in the host app on the next load", async ({ page, context, request }) => {
  const url = "/api/admin/apps/acme-billing/tours/billing-basics";
  const original = await (await request.get(url, { headers: ADMIN })).json();
  try {
    await signIn(page);
    await page.getByText("Acme Billing (second demo system)").click();
    await page.getByRole("link", { name: "Billing basics" }).click();

    await page.locator(".steps li").nth(1).click();
    await page.locator("app-step-editor input[name=title]").fill("Overdue (edited in admin)");

    // Add an action through the form: the engine will run it before step 2.
    await page.getByRole("button", { name: "+ Add action" }).click();
    await page.locator(".action select").selectOption("delay");
    await page.locator(".action input[type=number]").fill("50");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved and live")).toBeVisible();

    const host = await context.newPage();
    await host.goto("/demo/plain.html?tour=billing-basics");
    await host.locator("[data-guided-tour] .next").click();
    await expect(host.locator("[data-guided-tour] .title")).toHaveText("Overdue (edited in admin)");
  } finally {
    const current = await (await request.get(url, { headers: ADMIN })).json();
    await request.put(url, { headers: ADMIN, data: { ...original, updatedAt: current.updatedAt } });
  }
});

test("server validation errors are shown on the right step and field", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/apps/acme-billing/tours/billing-basics");
  await page.locator(".steps li").nth(2).click();
  await page.locator("app-step-editor input[name=page]").fill("https://evil.example/");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
  await expect(page.locator(".steps li.invalid")).toHaveCount(1);
  await expect(page.locator("app-step-editor .error")).toContainText("same site");
});

test("the admin portal's own onboarding tour runs inside the Angular app", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "How this works" }).click();
  const title = page.locator("[data-guided-tour] .title");
  const next = page.locator("[data-guided-tour] .next");
  const expected = [
    "Tours are data", "Your systems", "Tours for one system", "Draft or live", "Steps, in order",
    "Point at anything", "Actions between steps", "Or edit the JSON", "Save and it's live", "Replay any time",
  ];
  for (const [i, t] of expected.entries()) {
    await expect(title).toHaveText(t);
    if (i < expected.length - 1) await next.click();
  }
  await expect(page).toHaveURL(/\/admin\/apps\/tasky-demo\/tours\/email-walkthrough/); // navigated via the Angular router
  await next.click();
  await expect(page.locator("[data-guided-tour] .pop")).toBeHidden();
});

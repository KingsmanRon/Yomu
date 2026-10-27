import { expect, test } from "@playwright/test";
import { adminDb } from "./db";
import { backendAvailable, expectAccessible, onboard } from "./helpers";

/**
 * A facilitator creates a class; a learner joins it with the code and chooses
 * what to share; the facilitator sees exactly that. Needs `npm run db:seed-dev`.
 */
test("joining a class and what the facilitator sees", async ({ page, browser }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const staffContext = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const facilitator = await staffContext.newPage();
  await facilitator.goto("/staff");
  await facilitator.getByTestId("staff-email").fill("facilitator@yomu.test");
  await facilitator.getByTestId("staff-password").fill("yomu-dev-password");
  await facilitator.getByTestId("staff-signin").click();
  const name = `E2E class ${Date.now().toString(36)}`;
  await facilitator.getByTestId("new-class-name").fill(name);
  await facilitator.getByTestId("create-class").click();
  await expect(facilitator.getByTestId("class-name")).toHaveText(name);
  const code = (await facilitator.getByTestId("join-code").innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);
  await expect(facilitator.getByTestId("join-qr")).toBeVisible();
  await expectAccessible(facilitator, "staff class page");

  await onboard(page, { lang: "zu", avatar: "avatar-baobab", pin: "1593", save: "online" });
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-join").click();
  for (const d of code) await page.getByTestId(`digit-${d}`).click();
  await page.getByTestId("code-continue").click();
  await page.getByTestId("share-mastery-yes").click();
  await expectAccessible(page, "sharing choices");
  await page.getByTestId("join-confirm").click();
  await expect(page.getByTestId("joined-class")).toHaveText(name);

  await facilitator.reload();
  const row = facilitator.getByTestId("learner-table").locator("tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row.first()).toContainText("mastery");
  await expect(row.first()).not.toContainText("mistakes");
  await expect(facilitator.getByTestId("learner-detail-avatar-baobab")).toHaveCount(0);
  await staffContext.close();
});

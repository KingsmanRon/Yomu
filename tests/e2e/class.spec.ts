import { expect, test } from "@playwright/test";
import { totp } from "../totp";
import { adminDb, newStaffAccount } from "./db";
import { backendAvailable, expectAccessible, onboard } from "./helpers";

/**
 * A new facilitator signs in for the first time (setting up two-step sign-in)
 * and creates a class; a learner joins it with the code and chooses what to
 * share; the facilitator sees exactly that.
 */
test("joining a class and what the facilitator sees", async ({ page, browser }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  const { data: org } = await db.from("organisations").insert({ name: `E2E org ${Date.now().toString(36)}`, kind: "ngo" }).select("id").single();
  const account = await newStaffAccount(db, "facilitator", org!.id);
  const staffContext = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const facilitator = await staffContext.newPage();
  await facilitator.goto("/staff");
  await facilitator.getByTestId("staff-email").fill(account.email);
  await facilitator.getByTestId("staff-password").fill(account.password);
  await facilitator.getByTestId("staff-signin").click();

  // First sign-in: the password alone opens nothing until an authenticator app is set up.
  await expect(facilitator.getByTestId("mfa-enrol")).toBeVisible();
  await expect(facilitator.getByTestId("new-class-name")).toHaveCount(0);
  await expectAccessible(facilitator, "two-step set-up");
  const secret = (await facilitator.getByTestId("mfa-secret").innerText()).replace(/\s/g, "");
  await facilitator.getByTestId("mfa-code").fill(totp(secret));
  await facilitator.getByTestId("mfa-verify").click();
  await expect(facilitator.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  await expectAccessible(facilitator, "recovery codes");
  await expect(facilitator.getByTestId("recovery-saved")).toBeDisabled();
  await facilitator.getByTestId("recovery-saved-check").check();
  await facilitator.getByTestId("recovery-saved").click();
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
  await account.remove();
  await db.from("organisations").delete().eq("id", org!.id);
});

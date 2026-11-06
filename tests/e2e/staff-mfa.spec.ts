import { expect, test, type Page } from "@playwright/test";
import { totp } from "../totp";
import { adminDb, newStaffAccount, type StaffAccount } from "./db";
import { backendAvailable, expectAccessible } from "./helpers";

async function signIn(page: Page, account: StaffAccount) {
  await page.goto("/staff");
  await page.getByTestId("staff-email").fill(account.email);
  await page.getByTestId("staff-password").fill(account.password);
  await page.getByTestId("staff-signin").click();
}

async function saveRecoveryCodes(page: Page): Promise<string[]> {
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  const codes = await page.getByTestId("recovery-codes").locator("li").allInnerTexts();
  await page.getByTestId("recovery-saved-check").check();
  await page.getByTestId("recovery-saved").click();
  return codes.map((c) => c.trim());
}

/**
 * Staff two-step sign-in after set-up: the code at each sign-in, recovery
 * with a recovery code after losing the authenticator, and a platform
 * administrator's reset.
 */
test("staff sign in with a code, can recover with a recovery code, and can be reset by a platform administrator", async ({ page, browser }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  const reviewer = await newStaffAccount(db, "content_reviewer", null, { enrolled: true });
  const platformAdmin = await newStaffAccount(db, "platform_admin", null, { enrolled: true });
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const staff = await context.newPage();

  // Sign-in with the code; recovery codes are made at once, as none exist yet.
  await signIn(staff, reviewer);
  await expect(staff.getByTestId("mfa-verify-step")).toBeVisible();
  await expect(staff.getByTestId("review-link")).toHaveCount(0);
  await expectAccessible(staff, "two-step code");
  await staff.getByTestId("mfa-code").fill(totp(reviewer.totpSecret!));
  await staff.getByTestId("mfa-verify").click();
  const codes = await saveRecoveryCodes(staff);
  await expect(staff.getByTestId("review-link")).toBeVisible();
  await staff.getByTestId("staff-signout").click();

  // The phone with the authenticator is lost: a wrong code is refused, a recovery code lets the reviewer set up a new one.
  await signIn(staff, reviewer);
  await staff.getByTestId("mfa-code").fill(totp(reviewer.totpSecret!) === "000000" ? "111111" : "000000");
  await staff.getByTestId("mfa-verify").click();
  await expect(staff.getByTestId("mfa-verify-step").getByRole("alert")).toContainText("not correct");
  await staff.getByTestId("mfa-lost").click();
  await staff.getByTestId("recovery-code").fill(codes[0]);
  await staff.getByTestId("recovery-use").click();
  await expect(staff.getByTestId("mfa-enrol")).toContainText("Recovery code accepted");
  const secret = (await staff.getByTestId("mfa-secret").innerText()).replace(/\s/g, "");
  expect(secret).not.toBe(reviewer.totpSecret);
  await staff.getByTestId("mfa-code").fill(totp(secret));
  await staff.getByTestId("mfa-verify").click();
  await expect(staff.getByTestId("review-link")).toBeVisible();
  await expect(staff.getByTestId("two-step-card")).toContainText("9 unused recovery codes");
  await staff.getByTestId("staff-signout").click();

  // A platform administrator resets the reviewer's two-step sign-in.
  await signIn(staff, platformAdmin);
  await staff.getByTestId("mfa-code").fill(totp(platformAdmin.totpSecret!));
  await staff.getByTestId("mfa-verify").click();
  await saveRecoveryCodes(staff);
  await staff.getByTestId("mfa-reset-email").fill(reviewer.email);
  await expect(staff.getByTestId("mfa-reset")).toBeDisabled();
  await staff.getByTestId("mfa-reset-confirm").check();
  await staff.getByTestId("mfa-reset").click();
  await expect(staff.getByTestId("mfa-reset-card")).toContainText("was reset");
  const { data: events } = await db.from("staff_security_events").select("event, actor_user_id").eq("user_id", reviewer.userId).order("id");
  expect(events?.map((e) => e.event)).toEqual(["mfa_recovery_codes_issued", "mfa_recovered", "mfa_reset_by_admin"]);
  expect(events?.at(-1)?.actor_user_id).toBe(platformAdmin.userId);
  await staff.getByTestId("staff-signout").click();

  // The reviewer sets up a new authenticator at the next sign-in.
  await signIn(staff, reviewer);
  await expect(staff.getByTestId("mfa-enrol")).toBeVisible();

  await context.close();
  await reviewer.remove();
  await platformAdmin.remove();
});

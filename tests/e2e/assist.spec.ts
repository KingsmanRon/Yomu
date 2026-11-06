import { expect, test } from "@playwright/test";
import { totp } from "../totp";
import { adminDb, newStaffAccount } from "./db";
import { backendAvailable, enterPin, idb, onboard, playLesson, waitForRoute } from "./helpers";

/**
 * Facilitator-assisted move to a new phone, on two phones: the learner's
 * progress arrives on the new phone, the move is recorded, and the old phone
 * learns that it no longer holds the learner. The facilitator signs in with
 * password and authenticator code. Needs `npm run db:seed-dev` (the
 * "Morning class").
 */
test("a facilitator moves a learner to a new phone, and the old phone is signed out", async ({ page, browser }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  const { data: cohort } = await db.from("cohorts").select("id, join_code, organisation_id").eq("name", "Morning class").limit(1).single();
  test.skip(!cohort, "needs npm run db:seed-dev");
  const account = await newStaffAccount(db, "facilitator", cohort!.organisation_id, { enrolled: true });
  await db.from("cohort_facilitators").insert({ cohort_id: cohort!.id, user_id: account.userId });

  // The old phone: a registered learner in the class, with one lesson done and synced.
  await onboard(page, { lang: "st", avatar: "avatar-cow", pin: "3579", save: "online" });
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-join").click();
  for (const d of cohort!.join_code) await page.getByTestId(`digit-${d}`).click();
  await page.getByTestId("code-continue").click();
  await page.getByTestId("join-confirm").click();
  await page.goto("/#/home");
  await page.getByTestId("continue-lesson").click();
  await playLesson(page);
  await page.getByTestId("done-home").click();
  const xp = Number(await page.getByTestId("xp").innerText());
  expect(xp).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      return (await idb<{ synced: number }>(page, "ops")).filter((o) => o.synced === 0).length;
    }, { timeout: 30_000 })
    .toBe(0);
  const [profile] = await idb<{ learnerId: string }>(page, "profiles");

  // The new phone: the facilitator signs in, chooses the learner, and hands the phone over.
  const phone = await (await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await phone.getByTestId("sound-check-play").click();
  await phone.getByTestId("sound-check-ok").click();
  await phone.getByTestId("language-assist").click();
  await phone.getByTestId("assist-email").fill(account.email);
  await phone.getByTestId("assist-password").fill(account.password);
  await phone.getByTestId("assist-signin").click();
  // The password alone is not enough: a wrong code is refused, the right one lets the facilitator in.
  await phone.getByTestId("assist-code").fill(totp(account.totpSecret!) === "000000" ? "111111" : "000000");
  await phone.getByTestId("assist-verify").click();
  await expect(phone.getByTestId("assist-error")).toBeVisible();
  await phone.getByTestId("assist-code").fill(totp(account.totpSecret!));
  await phone.getByTestId("assist-verify").click();
  await phone.getByTestId(`assist-transfer-${profile.learnerId}`).click();
  await phone.getByTestId("assist-ready").click();
  await enterPin(phone, "3579");
  await phone.getByTestId("assist-finish").click();
  await waitForRoute(phone, "/home");
  await expect.poll(async () => Number(await phone.getByTestId("xp").innerText()), { timeout: 30_000 }).toBe(xp);

  const { data: moves } = await db.from("device_transfers").select("status").eq("learner_id", profile.learnerId);
  expect(moves).toEqual([{ status: "completed" }]);

  // The old phone finds out at its next sync, and offers to remove its copy.
  await expect
    .poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      return (await idb<{ sessionLost?: boolean }>(page, "profiles"))[0]?.sessionLost === true;
    }, { timeout: 30_000 })
    .toBe(true);
  await page.getByTestId("nav-me").click();
  await expect(page.getByTestId("me-moved-phone")).toBeVisible();
  await account.remove();
});

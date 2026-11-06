import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./db";
import { backendAvailable, idb, onboard, waitForRoute } from "./helpers";

/** A usage event waiting on the phone for this profile, as the app queues them. */
async function queueUsageEvent(page: Page, profileId: string) {
  await page.evaluate(async (id) => {
    const open = indexedDB.open("yomu");
    const db = await new Promise<IDBDatabase>((r) => (open.onsuccess = () => r(open.result)));
    await new Promise<void>((r) => {
      const tx = db.transaction("analytics", "readwrite");
      tx.objectStore("analytics").add({ profileId: id, event: "lesson_start", props: {}, at: new Date().toISOString() });
      tx.oncomplete = () => r();
    });
  }, profileId);
}

async function savedSignIn(page: Page, profileId: string) {
  return page.evaluate((id) => localStorage.getItem(`yomu-auth-${id}`), profileId);
}

async function openPrivacy(page: Page) {
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-privacy").click();
}

/** The hold-to-confirm button also works from the keyboard. */
async function hold(page: Page, testId: string) {
  await page.getByTestId(testId).focus();
  await page.keyboard.press("Enter");
}

test("deleting everything removes the account online and everything on the phone, even when the first reply is lost", async ({ page }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  await onboard(page, { lang: "st", avatar: "avatar-sun", pin: "2468", save: "online" });
  const [profile] = await idb<{ id: string; learnerId?: string }>(page, "profiles");
  const { data: learner } = await db.from("learners").select("auth_user_id").eq("id", profile.learnerId!).single();
  await queueUsageEvent(page, profile.id);
  expect(await savedSignIn(page, profile.id)).not.toBeNull();

  // The first attempt reaches the server, but its reply never arrives.
  await page.route("**/api/learner/delete", async (route) => {
    await route.fetch();
    await route.abort("connectionreset");
  }, { times: 1 });
  await openPrivacy(page);
  await hold(page, "delete-everything");
  await expect.poll(async () => (await db.from("learners").select("id").eq("id", profile.learnerId!)).data?.length, { timeout: 30_000 }).toBe(0);
  expect((await db.auth.admin.getUserById(learner!.auth_user_id)).error?.status).toBe(404);
  await expect(page.getByTestId("delete-everything")).toBeVisible();
  expect(await idb(page, "profiles")).toHaveLength(1);

  // Trying again finds the account already gone and removes the phone's copy too.
  await hold(page, "delete-everything");
  // With no learner left on the phone, the app starts again at the language choice.
  await expect(page.getByTestId("choose-st")).toBeVisible({ timeout: 30_000 });
  expect(await idb(page, "profiles")).toEqual([]);
  expect(await idb(page, "ops")).toEqual([]);
  // Only the next onboarding's own events (no profile yet) may be queued now.
  expect((await idb<{ profileId: string | null }>(page, "analytics")).filter((e) => e.profileId !== null)).toEqual([]);
  expect(await savedSignIn(page, profile.id)).toBeNull();
});

test("withdrawing consent to online storage deletes the account online and keeps learning on the phone", async ({ page }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  await onboard(page, { lang: "zu", avatar: "avatar-cow", pin: "1357", save: "online" });
  const [profile] = await idb<{ id: string; learnerId?: string }>(page, "profiles");
  const { data: learner } = await db.from("learners").select("auth_user_id").eq("id", profile.learnerId!).single();
  const opsBefore = (await idb<{ profileId: string }>(page, "ops")).filter((o) => o.profileId === profile.id).length;
  await queueUsageEvent(page, profile.id);

  await openPrivacy(page);
  await page.getByTestId("withdraw-consent").click();
  await waitForRoute(page, "/me");
  expect((await db.from("learners").select("id").eq("id", profile.learnerId!)).data).toEqual([]);
  expect((await db.auth.admin.getUserById(learner!.auth_user_id)).error?.status).toBe(404);

  const [after] = await idb<{ id: string; learnerId?: string; analyticsConsent?: boolean }>(page, "profiles");
  expect(after.id).toBe(profile.id);
  expect(after.learnerId).toBeUndefined();
  expect((await idb<{ profileId: string }>(page, "ops")).filter((o) => o.profileId === profile.id)).toHaveLength(opsBefore);
  expect((await idb<{ profileId: string }>(page, "analytics")).filter((e) => e.profileId === profile.id)).toEqual([]);
  expect(await savedSignIn(page, profile.id)).toBeNull();
  await page.goto("/#/home");
  await expect(page.getByTestId("continue-lesson")).toBeVisible();
});

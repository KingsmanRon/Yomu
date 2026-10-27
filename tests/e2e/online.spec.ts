import { expect, test } from "@playwright/test";
import { adminDb } from "./db";
import { backendAvailable, idb, onboard, playLesson, waitForRoute } from "./helpers";

/**
 * A registered learner (after the spoken consent) learns offline: the app
 * keeps working from the service worker cache, queues the work, and syncs it
 * when the connection returns. The server's own calculation must match.
 */
test("learning offline is kept and synced when back online", async ({ page, context }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  await onboard(page, { lang: "st", avatar: "avatar-fish", pin: "3579", save: "online" });
  const [profile] = await idb<{ learnerId?: string }>(page, "profiles");
  expect(profile.learnerId).toBeTruthy();
  const consents = await db.from("consent_records").select("consent_type, version, language").eq("learner_id", profile.learnerId!);
  expect(consents.data).toEqual([expect.objectContaining({ consent_type: "account_storage", language: "st" })]);

  // The service worker must control the page before going offline.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
  await context.setOffline(true);
  await page.reload();
  await waitForRoute(page, "/home");
  await expect(page.getByTestId("network-offline")).toBeVisible();
  await page.getByTestId("continue-lesson").click();
  await playLesson(page);
  await page.getByTestId("done-home").click();
  const xp = Number(await page.getByTestId("xp").innerText());
  const queued = (await idb<{ synced: number }>(page, "ops")).filter((o) => o.synced === 0).length;
  expect(queued).toBeGreaterThan(10);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await idb<{ synced: number }>(page, "ops")).filter((o) => o.synced === 0).length, { timeout: 30_000 }).toBe(0);
  const progress = await db.from("learner_progress").select("xp, lessons_completed").eq("learner_id", profile.learnerId!).single();
  expect(progress.data).toEqual({ xp, lessons_completed: 1 });
});

test("declining the consent keeps learning on the phone and stores nothing online", async ({ page }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  await page.goto("/");
  await page.getByTestId("sound-check-play").click();
  await page.getByTestId("sound-check-ok").click();
  await page.getByTestId("choose-zu").click();
  await page.getByTestId("continue").click();
  await page.getByTestId("demo-listen").click();
  await page.getByTestId("demo-step-listen").click();
  await page.getByTestId("demo-picture").click();
  await page.getByTestId("demo-continue").click();
  await page.getByTestId("continue").click();
  await page.getByTestId("avatar-avatar-pot").click();
  await page.getByTestId("continue").click();
  for (const d of "48264826") await page.getByTestId(`pin-key-${d}`).click();
  await page.getByTestId("save-online").click();
  await page.getByTestId("consent-decline").click();
  await waitForRoute(page, "/start-level");
  const [profile] = await idb<{ learnerId?: string }>(page, "profiles");
  expect(profile.learnerId).toBeUndefined();
  const auth = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("yomu-auth-")));
  expect(auth).toEqual([]);
});

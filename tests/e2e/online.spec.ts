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

test("usage counts are sent only after the learner says yes, and stop when they say no", async ({ page }) => {
  test.skip(!(await backendAvailable(page)) || !adminDb(), "needs the local Supabase stack");
  const db = adminDb()!;
  const since = new Date().toISOString();
  // The onboarding helper answers "no" to usage counts.
  await onboard(page, { lang: "zu", avatar: "avatar-drum", pin: "2581", save: "online", a11y: true });
  const [profile] = await idb<{ learnerId?: string }>(page, "profiles");
  const { data: learner } = await db.from("learners").select("pseudonym").eq("id", profile.learnerId!).single();
  const eventsOf = async () => (await db.from("analytics_events").select("event, props").eq("pseudonym", learner!.pseudonym)).data ?? [];
  const anonymous = async () => (await db.from("analytics_events").select("id").is("pseudonym", null).gte("received_at", since)).data ?? [];

  const openAndLeaveLesson = async () => {
    await page.goto("/#/home");
    await page.getByTestId("continue-lesson").click();
    await page.getByTestId("start-lesson").click();
    await page.getByTestId("continue").first().waitFor();
    await page.getByTestId("close").click();
    await page.getByTestId("stop-lesson").click();
    await waitForRoute(page, "/home");
  };
  // Coming online syncs and then sends (or deletes) the queued usage events.
  const queuedAfterSync = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    return (await idb(page, "analytics")).length;
  };

  // Said no: nothing is counted, not even without a name.
  await openAndLeaveLesson();
  await expect.poll(queuedAfterSync, { timeout: 30_000 }).toBe(0);
  expect(await eventsOf()).toEqual([]);
  expect(await anonymous()).toEqual([]);

  // Says yes in Me > Privacy: counted from now on, under the random pseudonym.
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-privacy").click();
  await page.getByTestId("usage-counts").click();
  await expect(page.getByTestId("usage-counts")).toHaveAttribute("aria-pressed", "true");
  const active = await db.from("consent_records").select("withdrawn_at").eq("learner_id", profile.learnerId!).eq("consent_type", "analytics");
  expect(active.data).toEqual([{ withdrawn_at: null }]);
  await openAndLeaveLesson();
  await expect.poll(queuedAfterSync, { timeout: 30_000 }).toBe(0);
  expect((await eventsOf()).map((e) => e.event).sort()).toEqual(["lesson_exit", "lesson_start"]);
  const exit = (await eventsOf()).find((e) => e.event === "lesson_exit");
  expect(exit?.props).toMatchObject({ language: "zu", step: expect.any(Number), stepId: expect.any(String) });

  // Says no again: the consent is withdrawn and counting stops at once.
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-privacy").click();
  await page.getByTestId("usage-counts").click();
  await expect(page.getByTestId("usage-counts")).toHaveAttribute("aria-pressed", "false");
  const withdrawn = await db.from("consent_records").select("withdrawn_at").eq("learner_id", profile.learnerId!).eq("consent_type", "analytics");
  expect(withdrawn.data?.[0]?.withdrawn_at).toBeTruthy();
  await openAndLeaveLesson();
  await expect.poll(queuedAfterSync, { timeout: 30_000 }).toBe(0);
  expect(await eventsOf()).toHaveLength(2);
  expect(await anonymous()).toEqual([]);
});

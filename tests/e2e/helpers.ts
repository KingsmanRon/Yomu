import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Shared steps for the end-to-end tests. The app is driven only through what a learner can tap. */
export type Lang = "zu" | "st";

export async function waitForRoute(page: Page, route: string) {
  await page.waitForFunction((r) => location.hash === `#${r}`, route, { timeout: 60_000 });
}

export async function enterPin(page: Page, pin: string) {
  for (const d of pin) await page.getByTestId(`pin-key-${d}`).click();
}

/** Voice-first onboarding up to the home screen. */
export async function onboard(page: Page, opts: { lang: Lang; avatar: string; pin: string; save: "phone" | "online"; addingToPhone?: boolean }) {
  if (!opts.addingToPhone) {
    await page.goto("/");
    await page.getByTestId("sound-check-play").click();
    await page.getByTestId("sound-check-ok").click();
  }
  await page.getByTestId(`choose-${opts.lang}`).click();
  await page.getByTestId("continue").click();
  await page.getByTestId("demo-listen").click();
  await page.getByTestId("demo-step-listen").click();
  await page.getByTestId("demo-picture").click();
  await page.getByTestId("demo-continue").click();
  await page.getByTestId("continue").click();
  await page.getByTestId(`avatar-${opts.avatar}`).click();
  await page.getByTestId("continue").click();
  await enterPin(page, opts.pin);
  await enterPin(page, opts.pin);
  await waitForRoute(page, "/save");
  if (opts.save === "phone") {
    await page.getByTestId("save-phone-only").click();
  } else {
    await page.getByTestId("save-online").click();
    // The agree button unlocks once the spoken explanation has played.
    await page.getByTestId("consent-agree").click({ timeout: 60_000 });
    await page.getByTestId("analytics-no").click();
    await enterPin(page, opts.pin);
  }
  await waitForRoute(page, "/start-level");
  await page.getByTestId("assessment-skip").click();
  await page.getByTestId("self-not-yet").click();
  await waitForRoute(page, "/home");
}

/**
 * Plays the open lesson to its end the way a hurried learner might: always
 * the first option, so some answers are wrong and the retry and reveal paths
 * run too. Returns the number of steps taken.
 */
export async function playLesson(page: Page, maxSteps = 120): Promise<number> {
  const visible = async (id: string) => (await page.getByTestId(id).count()) > 0 && page.getByTestId(id).first().isVisible();
  const enabled = async (id: string) => (await visible(id)) && page.getByTestId(id).first().isEnabled();
  for (let i = 0; i < maxSteps; i++) {
    await page.waitForTimeout(400);
    if (await visible("done-home")) return i;
    if (await enabled("continue")) {
      await page.getByTestId("continue").first().click();
      continue;
    }
    if (await visible("start-lesson")) {
      await page.getByTestId("start-lesson").click();
      continue;
    }
    if (await visible("download-continue")) {
      await page.getByTestId("download-continue").click();
      continue;
    }
    if (await visible("mic-decline")) {
      await page.getByTestId("mic-decline").click();
      continue;
    }
    if (await visible("said-it")) {
      await page.getByTestId("said-it").click();
      continue;
    }
    if (await visible("trace-area")) {
      const b = (await page.getByTestId("trace-area").boundingBox())!;
      await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.8, { steps: 8 });
      await page.mouse.up();
      if (await enabled("check")) await page.getByTestId("check").click();
      continue;
    }
    if (await visible("typing-input")) {
      await page.getByTestId("typing-input").fill("x");
      if (await enabled("check")) await page.getByTestId("check").click();
      continue;
    }
    if (await visible("tile")) {
      for (let t = 0; t < 10 && (await visible("tile")) && !(await enabled("check")); t++) await page.getByTestId("tile").first().click();
      if (await enabled("check")) await page.getByTestId("check").click();
      continue;
    }
    const options = page.locator("[data-testid=option]:enabled, [data-testid^=option-]:enabled");
    if ((await options.count()) > 0) {
      await options.first().click();
      if (await enabled("check")) await page.getByTestId("check").click();
      continue;
    }
  }
  throw new Error(`lesson did not finish within ${maxSteps} steps`);
}

/** WCAG 2.1 A/AA checks with axe on the current screen. */
export async function expectAccessible(page: Page, screen: string) {
  // @axe-core/playwright is typed against its own playwright-core copy; the page object is the same at runtime.
  const result = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `accessibility problems on ${screen}`).toEqual([]);
}

export async function idb<T>(page: Page, store: "profiles" | "ops"): Promise<T[]> {
  return page.evaluate(async (s) => {
    const req = indexedDB.open("yomu");
    const db = await new Promise<IDBDatabase>((r) => (req.onsuccess = () => r(req.result)));
    return new Promise<T[]>((r) => {
      const q = db.transaction(s).objectStore(s).getAll();
      q.onsuccess = () => r(q.result as T[]);
    });
  }, store);
}

export async function backendAvailable(page: Page): Promise<boolean> {
  const res = await page.request.get("/api/health");
  return res.ok() && ((await res.json()) as { backend: boolean }).backend === true;
}

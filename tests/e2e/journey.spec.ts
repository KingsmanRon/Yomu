import { expect, test } from "@playwright/test";
import { expectAccessible, onboard, playLesson, waitForRoute, type Lang } from "./helpers";

/**
 * The whole first-day journey in each teaching language, on a small phone
 * screen, as a guest (progress kept on the phone): voice-first onboarding,
 * placement, the first lesson, the result, and the main screens, with
 * accessibility checks along the way.
 */
for (const [lang, other] of [
  ["zu", "st"],
  ["st", "zu"],
] as [Lang, Lang][]) {
  test(`first day in ${lang === "zu" ? "isiZulu" : "Sesotho"}`, async ({ page }) => {
    // Accessibility is checked on settled screens (the app honours reduced motion).
    await page.emulateMedia({ reducedMotion: "reduce" });
    const audio: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/audio/")) audio.push(new URL(r.url()).pathname);
    });

    await page.goto("/");
    await page.getByTestId("sound-check-play").waitFor();
    await expectAccessible(page, "sound check");
    await onboard(page, { lang, avatar: lang === "zu" ? "avatar-protea" : "avatar-aloe", pin: "2468", save: "phone", a11y: true });
    await expect(page.getByTestId("continue-lesson")).toBeVisible();
    await expectAccessible(page, "home");

    await page.getByTestId("continue-lesson").click();
    await page.getByTestId("start-lesson").waitFor();
    await expectAccessible(page, "lesson intro");
    await page.getByTestId("start-lesson").click();
    await page.getByTestId("continue").first().waitFor();
    await expectAccessible(page, "teaching step");
    // The tutor's help (Tier 1: validated clips).
    await page.getByTestId("help").click();
    await page.getByTestId("help-panel").waitFor();
    await expectAccessible(page, "tutor help");
    await page.getByTestId("help-close").click();
    // The first exercise.
    const exercise = page.locator("[data-testid=option], [data-testid^=option-], [data-testid=tile], [data-testid=trace-area], [data-testid=typing-input]");
    for (let i = 0; i < 15 && (await exercise.count()) === 0; i++) {
      await page.getByTestId("continue").first().click();
      await page.waitForTimeout(400);
    }
    await exercise.first().waitFor();
    await expectAccessible(page, "exercise");

    await playLesson(page);
    await expect(page.getByTestId("done-xp")).toContainText("+");
    await expectAccessible(page, "lesson complete");
    await page.getByTestId("done-home").click();
    await waitForRoute(page, "/home");
    expect(Number(await page.getByTestId("xp").innerText())).toBeGreaterThan(0);
    await expect(page.getByTestId("streak")).toHaveText("1");

    for (const [nav, route, screen] of [
      ["nav-learn", "/path", "learning path"],
      ["nav-practice", "/practice", "practice"],
      ["nav-progress", "/progress", "progress"],
      ["nav-me", "/me", "me"],
    ] as const) {
      await page.getByTestId(nav).click();
      await waitForRoute(page, route);
      await page.waitForTimeout(500);
      await expectAccessible(page, screen);
    }
    await page.getByTestId("me-privacy").click();
    await waitForRoute(page, "/me/privacy");
    await expectAccessible(page, "privacy");

    // The placement activity, as reached from Me (nothing is recorded unless it is finished).
    await page.goto("/#/assessment/retake");
    await page.getByTestId("assessment-begin").waitFor();
    await expectAccessible(page, "placement activity introduction");
    await page.getByTestId("assessment-begin").click();
    await page.getByTestId("assessment-option").first().waitFor();
    await expectAccessible(page, "placement activity");

    // Spoken lines only ever come from this language (or English model audio for English words), never the
    // other one. The only exception is the language choice itself, where each language introduces itself.
    expect(audio.filter((p) => p.includes(`/${other}/`) && !p.includes("welcome.choose_language"))).toEqual([]);
    expect(audio.some((p) => p.includes(`/${lang}/`))).toBe(true);
  });
}

test("the learner can always see what is spoken: captions under every spoken line", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sound-check-play").click();
  await page.getByTestId("sound-check-ok").click();
  await page.getByTestId("choose-zu").click();
  await expect(page.getByTestId("caption").first()).not.toBeEmpty();
  await expect(page.getByTestId("listen-again")).toBeVisible();
});

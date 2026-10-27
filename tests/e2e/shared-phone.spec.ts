import { expect, test } from "@playwright/test";
import { enterPin, expectAccessible, onboard, playLesson, waitForRoute } from "./helpers";

/** Two learners share one phone: each has a picture and a PIN, and neither sees the other's learning. */
test("two learners on one phone stay separate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await onboard(page, { lang: "zu", avatar: "avatar-sun", pin: "1111", save: "phone" });
  await page.getByTestId("continue-lesson").click();
  await playLesson(page);
  await page.getByTestId("done-home").click();
  await waitForRoute(page, "/home");
  const xpA = Number(await page.getByTestId("xp").innerText());
  expect(xpA).toBeGreaterThan(0);

  // Learner B is added from the picture picker.
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-switch").click();
  await waitForRoute(page, "/profiles");
  await expectAccessible(page, "profile picker");
  await page.getByTestId("profile-add").click();
  await onboard(page, { lang: "st", avatar: "avatar-moon", pin: "2222", save: "phone", addingToPhone: true });
  expect(Number(await page.getByTestId("xp").innerText())).toBe(0);

  // Back to learner A: the PIN guards the profile; wrong PINs never lock the learner out, they only pause.
  await page.getByTestId("nav-me").click();
  await page.getByTestId("me-switch").click();
  await page.getByTestId("profile-avatar-sun").click();
  await page.getByTestId("pin-key-1").waitFor();
  await expectAccessible(page, "PIN entry");
  for (let i = 0; i < 4; i++) await enterPin(page, "9999");
  await expect(page.getByTestId("pin-wait")).toHaveCount(0);
  await enterPin(page, "9999");
  await expect(page.getByTestId("pin-wait")).toBeVisible();
  await expect(page.getByTestId("pin-assist")).toBeVisible();

  // The 30-second pause survives a reload (the app reopens on the same PIN screen); then the right PIN
  // opens learner A with A's own progress.
  await page.reload();
  await expect(page.getByTestId("pin-wait")).toBeVisible();
  await page.getByTestId("pin-key-1").waitFor({ timeout: 40_000 });
  await enterPin(page, "1111");
  await waitForRoute(page, "/home");
  expect(Number(await page.getByTestId("xp").innerText())).toBe(xpA);
});

test("spoken questions are not offered while no speech provider is verified", async ({ page }) => {
  await onboard(page, { lang: "zu", avatar: "avatar-star", pin: "1357", save: "phone" });
  await page.getByTestId("continue-lesson").click();
  await page.getByTestId("start-lesson").click();
  await page.getByTestId("help").click();
  await page.getByTestId("help-panel").waitFor();
  await expect(page.getByTestId("help-replay")).toBeVisible();
  await expect(page.getByTestId("help-ask")).toHaveCount(0);
});

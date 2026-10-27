import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests on a small Android-sized screen (360x640), against a
 * production build (`npm run build` first). Tests that need the local
 * Supabase stack skip themselves when the backend is not configured.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    actionTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "android-small",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 640 },
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npx next start -p ${port}`, url: `${baseURL}/api/health`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});

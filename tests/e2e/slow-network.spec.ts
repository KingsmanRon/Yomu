import { expect, test } from "@playwright/test";

/**
 * A first visit on a slow mobile connection (roughly 3G: 400 kbit/s down,
 * 400 ms latency). The first screen must be usable quickly and the
 * JavaScript it needs must stay within the 200 KB budget.
 */
test("first visit on a slow connection", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "network throttling uses the Chrome DevTools protocol");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 20_000 });
  const started = Date.now();
  await page.goto("/");
  await page.getByTestId("sound-check-play").waitFor({ timeout: 60_000 });
  const seconds = (Date.now() - started) / 1000;
  const js = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => (e as PerformanceResourceTiming).initiatorType === "script" || e.name.endsWith(".js"))
      .reduce((n, e) => n + (e as PerformanceResourceTiming).encodedBodySize, 0),
  );
  console.log(`first screen usable after ${seconds.toFixed(1)} s on slow 3G; ${(js / 1024).toFixed(0)} KB of JavaScript (compressed)`);
  expect(js).toBeLessThan(200 * 1024);
  expect(seconds).toBeLessThan(20);
});

/**
 * Performance budgets, measured with Lighthouse (mobile, simulated slow 4G
 * and a 4x slower CPU) against a running production server, plus the lesson
 * size budget from the content build.
 *
 *   npm run build && npm start   (in another terminal, or set PERF_URL)
 *   npm run perf:lighthouse
 *
 * Budgets: first-screen JavaScript under 200 KB (compressed: the scripts the
 * first page's HTML loads) and every lesson, with all its audio and images,
 * under 2 MB. The JavaScript the app prefetches in idle time afterwards (so
 * every screen works offline) is reported separately. Exits non-zero when a
 * budget is exceeded. Writes reports/lighthouse/summary.json.
 */
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Catalog } from "../src/lib/content/compiled";

interface Lhr {
  lighthouseVersion: string;
  categories: Record<string, { score: number | null }>;
  audits: Record<string, { numericValue?: number; details?: unknown }>;
}

/** Compressed size of a response, as a phone downloads it. */
function compressedSize(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    request(url, { headers: { "Accept-Encoding": "br, gzip" } }, (res) => {
      let n = 0;
      res.on("data", (c: Buffer) => (n += c.length));
      res.on("end", () => resolve(n));
      res.on("error", reject);
    })
      .on("error", reject)
      .end();
  });
}

/** JavaScript the first page needs: the scripts its HTML loads (later idle-time prefetches excluded). */
async function initialJavaScript(url: string): Promise<{ bytes: number; files: number }> {
  const html = await (await fetch(url)).text();
  const srcs = new Set<string>();
  // `noModule` scripts are legacy polyfills that current browsers never download.
  for (const m of html.matchAll(/<script([^>]*)>/g)) {
    const src = /src="([^"]+\.js)"/.exec(m[1])?.[1];
    if (src && !/nomodule/i.test(m[1])) srcs.add(src);
  }
  for (const m of html.matchAll(/<link[^>]+rel="preload"[^>]+as="script"[^>]+href="([^"]+)"|<link[^>]+href="([^"]+\.js)"[^>]+as="script"/g)) srcs.add(m[1] ?? m[2]);
  let bytes = 0;
  for (const src of srcs) bytes += await compressedSize(new URL(src, url).toString());
  return { bytes, files: srcs.size };
}

/** Lighthouse runs through its own CLI: its in-page code must not pass through this script's TypeScript transform. */
function runLighthouse(url: string): Lhr {
  const run = spawnSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules", "lighthouse", "cli", "index.js"),
      url,
      "--output=json",
      "--output-path=stdout",
      "--quiet",
      "--only-categories=performance,accessibility,best-practices",
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
    ],
    { env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath() }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) throw new Error(`lighthouse failed: ${run.stderr.slice(-2000)}`);
  return JSON.parse(run.stdout) as Lhr;
}

const URL_ = process.env.PERF_URL ?? "http://127.0.0.1:3000/";
const JS_BUDGET = 200 * 1024;
const LESSON_BUDGET = 2 * 1024 * 1024;

async function main() {
  {
    const lhr = runLighthouse(URL_);
    const audit = (id: string) => lhr.audits[id];
    const items = (audit("network-requests").details as { items?: { url: string; resourceType?: string; transferSize?: number }[] } | undefined)?.items ?? [];
    const scriptsDuringLoad = items.filter((i) => i.resourceType === "Script").reduce((n, i) => n + (i.transferSize ?? 0), 0);
    const totalBytes = items.reduce((n, i) => n + (i.transferSize ?? 0), 0);
    const initial = await initialJavaScript(URL_);
    const jsBytes = initial.bytes;

    const catalog = JSON.parse(readFileSync(join(process.cwd(), "public", "content", "catalog.json"), "utf8")) as Catalog;
    const lessons = catalog.lessons.flatMap((l) => (["zu", "st"] as const).map((lang) => ({ id: `${l.id} [${lang}]`, bytes: l.bytes[lang] })));
    const largest = lessons.reduce((a, b) => (b.bytes > a.bytes ? b : a));

    const summary = {
      url: URL_,
      measuredAt: new Date().toISOString(),
      lighthouseVersion: lhr.lighthouseVersion,
      settings: "mobile, simulated slow 4G, 4x CPU slowdown",
      scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)])),
      metrics: {
        firstContentfulPaintMs: Math.round(audit("first-contentful-paint").numericValue ?? 0),
        largestContentfulPaintMs: Math.round(audit("largest-contentful-paint").numericValue ?? 0),
        totalBlockingTimeMs: Math.round(audit("total-blocking-time").numericValue ?? 0),
        cumulativeLayoutShift: Number((audit("cumulative-layout-shift").numericValue ?? 0).toFixed(3)),
        interactiveMs: Math.round(audit("interactive").numericValue ?? 0),
      },
      bytes: {
        firstScreenJavaScript: jsBytes,
        firstScreenScripts: initial.files,
        // Includes the other screens fetched in idle time so the app works offline (cached once by the service worker).
        javaScriptIncludingIdlePrefetch: scriptsDuringLoad,
        pageLoadTotal: totalBytes,
        largestLesson: largest,
      },
      budgets: {
        firstScreenJavaScript: { limit: JS_BUDGET, ok: jsBytes <= JS_BUDGET },
        lesson: { limit: LESSON_BUDGET, ok: largest.bytes <= LESSON_BUDGET },
      },
    };
    mkdirSync(join(process.cwd(), "reports", "lighthouse"), { recursive: true });
    writeFileSync(join(process.cwd(), "reports", "lighthouse", "summary.json"), JSON.stringify(summary, null, 2));
    const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
    console.log(`Lighthouse ${summary.lighthouseVersion} (${summary.settings}) on ${URL_}`);
    console.log(`  scores: ${Object.entries(summary.scores).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    console.log(`  FCP ${summary.metrics.firstContentfulPaintMs} ms, LCP ${summary.metrics.largestContentfulPaintMs} ms, TBT ${summary.metrics.totalBlockingTimeMs} ms, CLS ${summary.metrics.cumulativeLayoutShift}`);
    console.log(`  first-screen JavaScript ${kb(jsBytes)} in ${initial.files} files (budget ${kb(JS_BUDGET)})`);
    console.log(`  with the idle-time prefetch of other screens for offline use: ${kb(scriptsDuringLoad)}; whole page load ${kb(totalBytes)}`);
    console.log(`  largest lesson ${largest.id} ${kb(largest.bytes)} (budget ${kb(LESSON_BUDGET)})`);
    if (!summary.budgets.firstScreenJavaScript.ok || !summary.budgets.lesson.ok) {
      console.error("✗ performance budget exceeded");
      process.exitCode = 1;
    } else console.log("✓ within budgets");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

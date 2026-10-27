/**
 * Builds everything the app downloads from the authored content:
 *
 *   public/content/catalog.json                 levels, units, lessons, badges, engine metadata
 *   public/content/lessons/<lang>/<id>.json     one self-contained lesson per teaching language
 *   public/content/clips.<lang>.json            Tier 1 tutor clip library
 *   public/content/app.<lang>.json              spoken interface lines
 *   public/content/assessment.<lang>.json       placement activity
 *   public/content/packs/<lang>/<unit>.json     downloadable lesson packs with sizes
 *   public/content/precache.json                what the service worker caches at install
 *   public/audio/placeholder/...                labelled placeholder tones for unrecorded lines
 *   public/sw.js                                service worker for this build
 *
 * Runs before `next build` (npm prebuild). Fails on invalid content, on audio
 * missing for any line, and when the precache exceeds its storage budget.
 *
 * Environment:
 *   HIDE_UNAPPROVED_CONTENT=true  ship only lessons whose every line is 'approved'
 *   SKIP_AUDIO_GENERATION=true    do not run ffmpeg (sizes of missing files count as 0)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectAudioAssets } from "../src/lib/content/assets";
import { compileContent, lessonUrl } from "../src/lib/content/compile";
import { loadContent } from "../src/lib/content/load";
import { validateContent } from "../src/lib/content/validate";
import { buildAudioIndex } from "./lib/audio";
import { hashContentTree } from "./lib/content-version";

const root = process.cwd();
const PRECACHE_BUDGET_BYTES = 3_500_000;
const LESSON_BUDGET_BYTES = 2_000_000;
const PRECACHE_LESSONS = ["l00-hl-vowels", "l10-satp"];
const SHELL_URLS = ["/", "/manifest.webmanifest", "/images/app-icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
/**
 * Spoken interface lines precached for offline use. Lines for features that
 * need the internet anyway (joining a class, sharing, deletion, export,
 * downloads, facilitator help, settings) are cached the first time they play.
 */
const OFFLINE_APP_LINES = /^(welcome|demo|save|consent|mic|repeat|profile|pin|profiles|assess|place|home|nav|path|lesson|revision|progress|badge|ui|net)\./;

function write(rel: string, data: unknown) {
  const file = join(root, "public", rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
}

async function main() {
  const started = Date.now();
  const { bundle, errors: loadErrors } = loadContent(root);
  if (!bundle) {
    for (const e of loadErrors) console.error(`  ✗ ${e}`);
    throw new Error("content failed to load; run npm run content:validate");
  }
  const report = validateContent(bundle);
  if (report.errors.length > 0) {
    for (const e of report.errors) console.error(`  ✗ ${e}`);
    throw new Error(`${report.errors.length} content error(s); run npm run content:validate`);
  }

  const assets = collectAudioAssets(bundle);
  const { index, report: audioReport } = await buildAudioIndex(root, assets, {
    generate: process.env.SKIP_AUDIO_GENERATION !== "true",
  });
  for (const r of audioReport.invalidRecordings) console.warn(`  ! recording for ${r.assetId} ignored: ${r.reason}`);

  const imageBytes = (id: string) => {
    const f = join(root, "public", "images", `${id}.svg`);
    return existsSync(f) ? statSync(f).size : 0;
  };
  const contentVersion = hashContentTree(root);
  const out = compileContent({
    bundle,
    audio: index,
    imageBytes,
    contentVersion,
    builtAt: new Date().toISOString(),
    hideUnapproved: process.env.HIDE_UNAPPROVED_CONTENT === "true",
    precacheLessons: PRECACHE_LESSONS,
    precacheBudgetBytes: PRECACHE_BUDGET_BYTES,
    shellUrls: SHELL_URLS,
    precacheAppLine: (id) => OFFLINE_APP_LINES.test(id),
  });
  if (out.errors.length > 0) {
    for (const e of out.errors) console.error(`  ✗ ${e}`);
    throw new Error(`${out.errors.length} compile error(s)`);
  }

  rmSync(join(root, "public", "content"), { recursive: true, force: true });
  write("content/catalog.json", out.catalog);
  for (const lang of ["zu", "st"] as const) {
    for (const lesson of out.lessons[lang]) write(lessonUrl(lang, lesson.id).slice(1), lesson);
    write(`content/clips.${lang}.json`, out.clips[lang]);
    write(`content/app.${lang}.json`, out.app[lang]);
    write(`content/assessment.${lang}.json`, out.assessment[lang]);
    for (const pack of out.packs[lang]) write(`content/packs/${lang}/${pack.unit}.json`, pack);
  }
  write("content/precache.json", out.precache);

  const template = readFileSync(join(root, "scripts", "sw", "sw-template.js"), "utf8");
  const swVersion = `${contentVersion}-${Date.now().toString(36)}`;
  write("sw.js", template.replace("__VERSION__", swVersion).replace("__PRECACHE__", JSON.stringify(out.precache.urls)));

  // Report.
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`Content ${contentVersion}: ${out.lessons.zu.length} isiZulu and ${out.lessons.st.length} Sesotho lessons`);
  console.log(
    `Audio: ${audioReport.recorded} recorded, ${audioReport.placeholders} placeholders (${audioReport.generated} generated now, ${audioReport.removedStale} stale removed)`,
  );
  let overBudget = false;
  for (const lang of ["zu", "st"] as const) {
    for (const lesson of out.lessons[lang]) {
      if (lesson.assets.bytes > LESSON_BUDGET_BYTES) {
        overBudget = true;
        console.error(`  ✗ ${lesson.id} [${lang}] needs ${kb(lesson.assets.bytes)}, over the ${kb(LESSON_BUDGET_BYTES)} per-lesson budget`);
      }
    }
    const packs = out.packs[lang].map((p) => `${p.unit} ${kb(p.bytes)}`).join(", ");
    console.log(`Packs [${lang}]: ${packs}`);
  }
  console.log(`Precache: ${out.precache.urls.length} files, ${kb(out.precache.bytes)} of ${kb(PRECACHE_BUDGET_BYTES)} budget (plus app scripts)`);
  if (out.precache.bytes > PRECACHE_BUDGET_BYTES) {
    overBudget = true;
    console.error("  ✗ precache is over its storage budget");
  }
  if (overBudget) throw new Error("asset budgets exceeded");
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});

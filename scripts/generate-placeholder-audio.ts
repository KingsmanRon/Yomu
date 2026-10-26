/**
 * Create (or refresh) the labelled placeholder audio for every spoken line
 * that has no valid recording yet, and report recording coverage.
 *
 *   npm run audio:placeholders
 *
 * Placeholders are short tone patterns, a different pair of tones for each
 * language, never speech: the app shows a "placeholder audio" label while
 * one plays, so nobody mistakes them for (or substitutes) real isiZulu,
 * Sesotho or English speech. `npm run build` runs the same step.
 */
import { collectAudioAssets } from "../src/lib/content/assets";
import { loadContent } from "../src/lib/content/load";
import { buildAudioIndex } from "./lib/audio";

async function main() {
  const root = process.cwd();
  const { bundle, errors } = loadContent(root);
  if (!bundle) throw new Error(`content did not load:\n${errors.join("\n")}`);
  const assets = collectAudioAssets(bundle);
  const { report } = await buildAudioIndex(root, assets, { generate: true });
  const byLang = new Map<string, number>();
  for (const a of assets) byLang.set(a.lang, (byLang.get(a.lang) ?? 0) + 1);
  console.log(`Spoken lines: ${assets.length} (${[...byLang].map(([l, n]) => `${l} ${n}`).join(", ")})`);
  console.log(`Recorded: ${report.recorded}; placeholders: ${report.placeholders} (${report.generated} generated now, ${report.removedStale} stale removed)`);
  for (const r of report.invalidRecordings) console.warn(`  ! recording for ${r.assetId} not used: ${r.reason}`);
  if (report.unusedRecordings.length > 0) console.warn(`  ! ${report.unusedRecordings.length} recording(s) match no current line: ${report.unusedRecordings.slice(0, 10).join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

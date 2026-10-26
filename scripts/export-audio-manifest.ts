/**
 * Exports every line that needs recording to a CSV recording manifest for
 * voice talent (content/audio/recording-manifest.csv), one row per audio
 * asset, plus one CSV per language for each recording session.
 *
 *   npm run audio:manifest
 *
 * Recorded files must be named exactly `<asset_id>.wav` (or .flac) and are
 * imported with `npm run audio:import -- --source <folder>`.
 * See docs/audio-recording-guidelines.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectAudioAssets } from "../src/lib/content/assets";
import { loadContent } from "../src/lib/content/load";
import { loadRecordings, placeholderSeconds, textHash } from "./lib/audio";

const root = process.cwd();
const { bundle, errors } = loadContent(root);
if (!bundle) {
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const csvCell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const recordings = new Map(loadRecordings(root).recordings.map((r) => [r.assetId, r]));
const header = [
  "asset_id",
  "language",
  "text_to_record",
  "context_note",
  "where_used",
  "kind",
  "lesson_id",
  "target_duration_s",
  "review_status",
  "recorded",
  "file_name",
];
const LANGUAGE_NAMES = { zu: "isiZulu", st: "Sesotho (South Africa)", en: "English (South Africa)" } as const;

const assets = collectAudioAssets(bundle).sort((a, b) => a.lang.localeCompare(b.lang) || a.id.localeCompare(b.id));
const rows = assets.map((a) => {
  const rec = recordings.get(a.id);
  const recorded = rec ? (rec.textSha256 === textHash(a.text) ? "yes" : "re-record: script changed") : "no";
  return [
    a.id,
    LANGUAGE_NAMES[a.lang],
    a.text,
    a.note ?? "",
    a.usage,
    a.kind,
    a.lessonId ?? "",
    placeholderSeconds(a),
    a.review,
    recorded,
    `${a.id}.wav`,
  ];
});

const dir = join(root, "content", "audio");
mkdirSync(dir, { recursive: true });
const toCsv = (rs: (string | number)[][]) =>
  "﻿" + [header, ...rs].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
writeFileSync(join(dir, "recording-manifest.csv"), toCsv(rows));
for (const lang of ["zu", "st", "en"] as const) {
  writeFileSync(join(dir, `recording-manifest.${lang}.csv`), toCsv(rows.filter((_, i) => assets[i].lang === lang)));
}

const totalSeconds = assets.reduce((n, a) => n + placeholderSeconds(a), 0);
const done = rows.filter((r) => r[9] === "yes").length;
console.log(`Wrote content/audio/recording-manifest.csv (${assets.length} lines, ~${Math.round(totalSeconds / 60)} min of speech)`);
for (const lang of ["zu", "st", "en"] as const) {
  const n = assets.filter((a) => a.lang === lang);
  console.log(`  ${LANGUAGE_NAMES[lang].padEnd(24)} ${String(n.length).padStart(4)} lines, ~${Math.round(n.reduce((s, a) => s + placeholderSeconds(a), 0) / 60)} min`);
}
console.log(`Recorded: ${done} of ${assets.length}`);

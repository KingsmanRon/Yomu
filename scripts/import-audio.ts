/**
 * Imports recorded audio and links each file to its asset ID.
 *
 *   npm run audio:import -- --source ./recordings            import and encode
 *   npm run audio:import -- --source ./recordings --dry-run  report only
 *   npm run audio:import -- --report                         report on current state
 *
 * Naming convention: each source file is named exactly after its asset ID,
 * e.g. `zu.l10-satp.intro.wav`, in any sub-folder of the source. Accepted
 * formats: wav, flac, mp3, m4a, ogg, opus.
 *
 * For every file the script trims leading and trailing silence, normalises
 * loudness to -18 LUFS, downmixes to mono and encodes Ogg Opus (16 kbps) and
 * AAC (32 kbps) into public/audio/rec/<lang>/, then records it in
 * content/audio/recordings.json together with a hash of the script text, so a
 * later script change marks the recording for re-recording.
 *
 * Reports missing (no recording), unused (file matches no asset), mismatched
 * (file language differs from the asset's language), duplicate and invalid
 * files. Exit code 1 when anything is mismatched, duplicated or invalid.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { collectAudioAssets, type AudioAsset } from "../src/lib/content/assets";
import { loadContent } from "../src/lib/content/load";
import {
  AAC_BITRATE,
  LOUDNESS,
  SPEECH_BITRATE,
  loadRecordings,
  placeholderSeconds,
  recordingsPath,
  run,
  sha,
  textHash,
  type Recording,
} from "./lib/audio";

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const source = option("--source");
const dryRun = flag("--dry-run");
const AUDIO_EXT = new Set([".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus"]);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (AUDIO_EXT.has(extname(f).toLowerCase())) out.push(p);
  }
  return out;
}

function probeMs(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
  return Math.round(parseFloat(out) * 1000);
}

async function encode(input: string, asset: AudioAsset): Promise<Recording> {
  const tmpSha = sha(readFileSync(input).toString("base64"), 8);
  const base = `audio/rec/${asset.lang}/${asset.id}.${tmpSha}`;
  const outDir = join(root, "public", "audio", "rec", asset.lang);
  mkdirSync(outDir, { recursive: true });
  const trim = [
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15",
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25",
    "areverse",
  ].join(",");
  const ogg = join(root, "public", `${base}.ogg`);
  const m4a = join(root, "public", `${base}.m4a`);
  // Separate passes: in ffmpeg 6.x, silenceremove and loudnorm in one filter
  // graph can stall, so trim, normalise and encode one step at a time.
  const tmp = (n: number) => join(tmpdir(), `yomu-import-${process.pid}-${tmpSha}-${n}.wav`);
  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", trim, "-ac", "1", "-ar", "48000", tmp(1)]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", tmp(1), "-af", `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`, "-ar", "48000", tmp(2)]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", tmp(2), "-c:a", "libopus", "-b:a", SPEECH_BITRATE, "-application", "voip", ogg]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", tmp(2), "-ar", "24000", "-c:a", "aac", "-b:a", AAC_BITRATE, "-movflags", "+faststart", m4a]);
  } finally {
    rmSync(tmp(1), { force: true });
    rmSync(tmp(2), { force: true });
  }
  return {
    assetId: asset.id,
    file: `${base}.ogg`,
    aacFile: `${base}.m4a`,
    bytes: statSync(ogg).size,
    aacBytes: statSync(m4a).size,
    ms: probeMs(ogg),
    textSha256: textHash(asset.text),
    importedAt: new Date().toISOString(),
    sourceFile: basename(input),
  };
}

async function main() {
  const { bundle, errors } = loadContent(root);
  if (!bundle) {
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  const assets = new Map(collectAudioAssets(bundle).map((a) => [a.id, a]));
  const manifest = loadRecordings(root);
  const recordings = new Map(manifest.recordings.map((r) => [r.assetId, r]));
  const problems = { unused: [] as string[], mismatched: [] as string[], duplicates: [] as string[], invalid: [] as string[] };
  let imported = 0;

  if (source) {
    if (!existsSync(source)) throw new Error(`source folder '${source}' does not exist`);
    const byAsset = new Map<string, string[]>();
    for (const file of listFiles(source)) {
      const id = basename(file, extname(file));
      const asset = assets.get(id);
      if (!asset) {
        // A file named for one language but placed in another language's folder, or a typo.
        problems.unused.push(file);
        continue;
      }
      const folderLang = file.split(/[\\/]/).find((p) => p === "zu" || p === "st" || p === "en");
      if (folderLang && folderLang !== asset.lang) {
        problems.mismatched.push(`${file}: in a '${folderLang}' folder but ${id} is ${asset.lang}`);
        continue;
      }
      byAsset.set(id, [...(byAsset.get(id) ?? []), file]);
    }
    for (const [id, files] of byAsset) {
      if (files.length > 1) {
        problems.duplicates.push(`${id}: ${files.join(", ")}`);
        continue;
      }
      const asset = assets.get(id)!;
      if (dryRun) {
        imported += 1;
        continue;
      }
      try {
        const rec = await encode(files[0], asset);
        const target = placeholderSeconds(asset) * 1000;
        if (rec.ms > target * 2.5 || rec.ms < target * 0.25)
          console.warn(`  ! ${id}: ${(rec.ms / 1000).toFixed(1)} s is far from the ~${(target / 1000).toFixed(1)} s target`);
        recordings.set(id, rec);
        imported += 1;
      } catch (e) {
        problems.invalid.push(`${files[0]}: ${(e as Error).message}`);
      }
    }
    if (!dryRun) {
      writeFileSync(
        recordingsPath(root),
        JSON.stringify(
          {
            description:
              "Imported recordings. Generated by scripts/import-audio.ts; do not edit by hand. textSha256 is the hash of the script text that was recorded.",
            recordings: [...recordings.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)),
          },
          null,
          2,
        ) + "\n",
      );
    }
  }

  const missing = [...assets.values()].filter((a) => {
    const r = recordings.get(a.id);
    return !r || r.textSha256 !== textHash(a.text);
  });
  const stale = [...recordings.values()].filter((r) => !assets.has(r.assetId));
  console.log(`${dryRun ? "Would import" : "Imported"}: ${imported}`);
  for (const lang of ["zu", "st", "en"] as const) {
    const total = [...assets.values()].filter((a) => a.lang === lang).length;
    const miss = missing.filter((a) => a.lang === lang).length;
    console.log(`  ${lang}: ${total - miss} of ${total} recorded`);
  }
  if (stale.length) console.log(`Recordings for assets that no longer exist: ${stale.map((r) => r.assetId).join(", ")}`);
  for (const [k, list] of Object.entries(problems)) {
    if (list.length === 0) continue;
    console.log(`${k} (${list.length}):`);
    for (const item of list.slice(0, 50)) console.log(`  - ${item}`);
  }
  if (problems.mismatched.length + problems.duplicates.length + problems.invalid.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});

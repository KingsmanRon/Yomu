/**
 * Audio pipeline helpers: recordings manifest, placeholder generation and the
 * audio index used by the content build.
 *
 * Real recordings are imported with `npm run audio:import` and listed in
 * content/audio/recordings.json. Every asset without a valid recording gets a
 * generated placeholder: a tone pattern that is obviously not speech, with a
 * different pattern per language, never English speech standing in for
 * isiZulu or Sesotho.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { estimateSeconds, type AudioAsset, type AudioLanguage } from "../../src/lib/content/assets";

export const PLACEHOLDER_VERSION = 1;
/** Opus bitrate for speech. Low enough for expensive mobile data, clear enough for voice. */
export const SPEECH_BITRATE = "16k";
export const AAC_BITRATE = "32k";
/** Integrated loudness target for imported recordings (EBU R128 style, louder for phone speakers). */
export const LOUDNESS = { I: -18, TP: -1.5, LRA: 11 };

/** Tone pairs (Hz) per language, so a listener can tell placeholders apart. */
export const PLACEHOLDER_TONES: Record<AudioLanguage, [number, number]> = {
  zu: [392, 523],
  st: [440, 659],
  en: [784, 784],
};

export interface Recording {
  assetId: string;
  /** Path under public/, e.g. "audio/rec/zu/zu.l10-satp.intro.3f2a1b9c.ogg". */
  file: string;
  aacFile?: string;
  bytes: number;
  aacBytes?: number;
  ms: number;
  /** Hash of the script text that was recorded; a changed script invalidates the recording. */
  textSha256: string;
  importedAt: string;
  sourceFile: string;
}

export interface RecordingsManifest {
  description: string;
  recordings: Recording[];
}

export interface AudioIndexEntry {
  id: string;
  lang: AudioLanguage;
  src: string;
  srcAac?: string;
  bytes: number;
  ms: number;
  placeholder: boolean;
}

export const sha = (s: string, n = 64) => createHash("sha256").update(s).digest("hex").slice(0, n);
export const textHash = (text: string) => sha(text.normalize("NFC").trim());

export function recordingsPath(root: string) {
  return join(root, "content", "audio", "recordings.json");
}

export function loadRecordings(root: string): RecordingsManifest {
  const file = recordingsPath(root);
  if (!existsSync(file)) return { description: "", recordings: [] };
  return JSON.parse(readFileSync(file, "utf8")) as RecordingsManifest;
}

export function placeholderSeconds(asset: AudioAsset): number {
  return asset.seconds ?? estimateSeconds(asset.text, asset.lang);
}

export function placeholderRelPath(asset: AudioAsset): string {
  const seconds = placeholderSeconds(asset);
  const h = sha(`${PLACEHOLDER_VERSION}|${asset.lang}|${seconds}|${SPEECH_BITRATE}`, 8);
  return `audio/placeholder/${asset.lang}/${asset.id}.${h}.ogg`;
}

export function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))));
  });
}

export function placeholderArgs(lang: AudioLanguage, seconds: number, out: string): string[] {
  const [f1, f2] = PLACEHOLDER_TONES[lang];
  // Alternating beeps: 0.28 s on, 0.12 s off, switching pitch every beep.
  const expr = `0.25*sin(2*PI*t*if(lt(mod(t\\,0.8)\\,0.4)\\,${f1}\\,${f2}))*lt(mod(t\\,0.4)\\,0.28)`;
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `aevalsrc=${expr}:s=48000:d=${seconds}`,
    "-c:a", "libopus", "-b:a", SPEECH_BITRATE, "-vbr", "off", "-application", "voip", "-ac", "1",
    out,
  ];
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export interface AudioIndexReport {
  recorded: number;
  placeholders: number;
  generated: number;
  removedStale: number;
  invalidRecordings: { assetId: string; reason: string }[];
  unusedRecordings: string[];
}

/**
 * Build the audio index for all assets, generating placeholder files that
 * are missing and removing stale ones.
 */
export async function buildAudioIndex(
  root: string,
  assets: AudioAsset[],
  opts: { generate?: boolean; concurrency?: number } = {},
): Promise<{ index: Map<string, AudioIndexEntry>; report: AudioIndexReport }> {
  const publicDir = join(root, "public");
  const manifest = loadRecordings(root);
  const byAsset = new Map(manifest.recordings.map((r) => [r.assetId, r]));
  const assetIds = new Set(assets.map((a) => a.id));
  const report: AudioIndexReport = {
    recorded: 0,
    placeholders: 0,
    generated: 0,
    removedStale: 0,
    invalidRecordings: [],
    unusedRecordings: manifest.recordings.filter((r) => !assetIds.has(r.assetId)).map((r) => r.assetId),
  };
  const index = new Map<string, AudioIndexEntry>();
  const toGenerate: { asset: AudioAsset; rel: string; seconds: number }[] = [];
  const wanted = new Set<string>();

  for (const asset of assets) {
    const rec = byAsset.get(asset.id);
    let valid = false;
    if (rec) {
      if (rec.textSha256 !== textHash(asset.text)) report.invalidRecordings.push({ assetId: asset.id, reason: "script text changed since recording" });
      else if (!existsSync(join(publicDir, rec.file))) report.invalidRecordings.push({ assetId: asset.id, reason: `file public/${rec.file} missing` });
      else if (!rec.file.includes(`/${asset.lang}/`)) report.invalidRecordings.push({ assetId: asset.id, reason: "recording filed under the wrong language" });
      else valid = true;
    }
    if (valid && rec) {
      report.recorded += 1;
      index.set(asset.id, {
        id: asset.id,
        lang: asset.lang,
        src: `/${rec.file}`,
        srcAac: rec.aacFile ? `/${rec.aacFile}` : undefined,
        bytes: rec.bytes,
        ms: rec.ms,
        placeholder: false,
      });
      continue;
    }
    const rel = placeholderRelPath(asset);
    const seconds = placeholderSeconds(asset);
    wanted.add(rel);
    report.placeholders += 1;
    if (!existsSync(join(publicDir, rel))) toGenerate.push({ asset, rel, seconds });
    index.set(asset.id, { id: asset.id, lang: asset.lang, src: `/${rel}`, bytes: 0, ms: Math.round(seconds * 1000), placeholder: true });
  }

  if (toGenerate.length > 0 && opts.generate !== false) {
    await pool(toGenerate, opts.concurrency ?? 6, async ({ asset, rel, seconds }) => {
      const out = join(publicDir, rel);
      mkdirSync(dirname(out), { recursive: true });
      await run("ffmpeg", placeholderArgs(asset.lang, seconds, out));
      report.generated += 1;
    });
  }

  // Sizes, and removal of placeholders that are no longer referenced.
  for (const entry of index.values()) {
    if (!entry.placeholder) continue;
    const file = join(publicDir, entry.src);
    entry.bytes = existsSync(file) ? statSync(file).size : 0;
  }
  const placeholderRoot = join(publicDir, "audio", "placeholder");
  if (existsSync(placeholderRoot)) {
    for (const lang of readdirSync(placeholderRoot)) {
      for (const f of readdirSync(join(placeholderRoot, lang))) {
        const rel = `audio/placeholder/${lang}/${f}`;
        if (!wanted.has(rel)) {
          rmSync(join(placeholderRoot, lang, f));
          report.removedStale += 1;
        }
      }
    }
  }
  return { index, report };
}

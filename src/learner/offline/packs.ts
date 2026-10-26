import type { Lang, LessonPack } from "@/lib/content/compiled";
import { getMeta, setMeta, type YomuDB } from "./db";

/**
 * Lesson packs: everything a unit needs offline (lesson files, audio and
 * pictures) for one teaching language, downloaded into the Cache API only
 * when the learner chooses, after seeing the size.
 */
export const PACK_CACHE = "yomu-packs-v1";

export interface DownloadedPack {
  unit: string;
  lang: Lang;
  bytes: number;
  urls: string[];
  downloadedAt: string;
}

const metaKey = (lang: Lang) => `packs:${lang}`;

export async function fetchPack(lang: Lang, unit: string): Promise<LessonPack> {
  const res = await fetch(`/content/packs/${lang}/${unit}.json`);
  if (!res.ok) throw new Error(`pack ${unit} unavailable`);
  return (await res.json()) as LessonPack;
}

export async function downloadedPacks(db: YomuDB, lang: Lang): Promise<Record<string, DownloadedPack>> {
  return (await getMeta<Record<string, DownloadedPack>>(db, metaKey(lang))) ?? {};
}

export async function downloadPack(
  db: YomuDB,
  pack: LessonPack,
  onProgress: (done: number, total: number) => void = () => {},
  signal?: AbortSignal,
): Promise<void> {
  const cache = await caches.open(PACK_CACHE);
  let done = 0;
  for (const url of pack.urls) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (!(await cache.match(url))) {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`download failed: ${url}`);
      await cache.put(url, res);
    }
    done += 1;
    onProgress(done, pack.urls.length);
  }
  const all = await downloadedPacks(db, pack.lang);
  all[pack.unit] = { unit: pack.unit, lang: pack.lang, bytes: pack.bytes, urls: pack.urls, downloadedAt: new Date().toISOString() };
  await setMeta(db, metaKey(pack.lang), all);
}

/** Remove a pack, keeping files another downloaded pack still needs. */
export async function removePack(db: YomuDB, lang: Lang, unit: string): Promise<void> {
  const all = await downloadedPacks(db, lang);
  const pack = all[unit];
  if (!pack) return;
  delete all[unit];
  const stillNeeded = new Set(Object.values(all).flatMap((p) => p.urls));
  const cache = await caches.open(PACK_CACHE);
  for (const url of pack.urls) if (!stillNeeded.has(url)) await cache.delete(url);
  await setMeta(db, metaKey(lang), all);
}

/** Whether a URL is available without the network (precache, packs or earlier use). */
export async function isCached(url: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  return !!(await caches.match(url));
}

export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage ?? 0, quota: e.quota ?? 0 };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

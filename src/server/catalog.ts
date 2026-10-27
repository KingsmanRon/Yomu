import "server-only";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, CompiledLesson, Lang } from "@/lib/content/compiled";

/**
 * The compiled catalog (public/content/catalog.json, produced by the content
 * build) gives the server the same curriculum metadata the phone uses, so the
 * server's recomputation matches the device exactly.
 */
let cached: { mtimeMs: number; catalog: Catalog } | null = null;

export function loadCatalog(): Catalog {
  const file = join(process.cwd(), "public", "content", "catalog.json");
  const mtimeMs = statSync(file).mtimeMs;
  if (!cached || cached.mtimeMs !== mtimeMs) {
    cached = { mtimeMs, catalog: JSON.parse(readFileSync(file, "utf8")) as Catalog };
  }
  return cached.catalog;
}

/** Today in South Africa (SAST, UTC+2, no daylight saving), for server-side streak status. */
export function todayInSouthAfrica(now: Date = new Date()): string {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

const lessonCache = new Map<string, { mtimeMs: number; lesson: CompiledLesson }>();

/** A compiled lesson (public/content/lessons/{lang}/{id}.json), or null when it does not exist. */
export function loadCompiledLesson(lang: Lang, id: string): CompiledLesson | null {
  if (!/^l\d\d-[a-z0-9-]+$/.test(id)) return null;
  const file = join(process.cwd(), "public", "content", "lessons", lang, `${id}.json`);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const key = `${lang}/${id}`;
  const hit = lessonCache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.lesson;
  const lesson = JSON.parse(readFileSync(file, "utf8")) as CompiledLesson;
  lessonCache.set(key, { mtimeMs, lesson });
  return lesson;
}

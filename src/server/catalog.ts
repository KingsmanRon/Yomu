import "server-only";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Catalog } from "@/lib/content/compiled";

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

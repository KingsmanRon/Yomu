import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha } from "./audio";

/**
 * Version of the content tree: a hash over every JSON file under content/.
 * The same ID is used by the build (packs, service worker) and by the
 * database seed, so a lesson in the app can be traced to its seeded version.
 */
export function hashContentTree(root: string): string {
  const parts: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) parts.push(`${p.slice(root.length)}:${sha(readFileSync(p, "utf8"))}`);
    }
  };
  walk(join(root, "content"));
  return sha(parts.join("\n"), 12);
}

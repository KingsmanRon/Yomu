/**
 * Bring review decisions recorded in the content review tool back into the
 * content files, which stay the source of truth (and are versioned in git).
 *
 *   npm run content:pull-reviews
 *
 * For each spoken line, every review in the database is added to the line's
 * review history and the latest decision becomes its status. A review only
 * applies to the exact text that was reviewed: if the script text has changed
 * in the files since, the review is skipped and reported, and the line keeps
 * its file status (normally 'draft') until it is reviewed again.
 *
 * Afterwards: check the diff, run npm run content:validate, commit, and run
 * npm run db:seed-content.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { must, scriptClient } from "./lib/supabase";

type Status = "draft" | "native_speaker_reviewed" | "educator_reviewed" | "approved";
interface ReviewEvent {
  status: Status;
  role: string;
  date: string;
  notes?: string;
}
interface Line {
  id: string;
  text: string;
  review: { status: Status; history?: ReviewEvent[] };
}
interface DbReview {
  asset_id: string;
  status: Status;
  reviewer_role: string;
  notes: string | null;
  created_at: string;
  content_assets: { text: string } | null;
}

const root = process.cwd();

function jsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "schema") out.push(...jsonFiles(p));
    } else if (f.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Every spoken line object in a parsed content file. */
function linesIn(node: unknown, found: Line[] = []): Line[] {
  if (Array.isArray(node)) for (const n of node) linesIn(n, found);
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.text === "string" && o.review && typeof o.review === "object") found.push(o as unknown as Line);
    for (const v of Object.values(o)) linesIn(v, found);
  }
  return found;
}

const sameEvent = (a: ReviewEvent, b: ReviewEvent) => a.status === b.status && a.role === b.role && a.date === b.date && (a.notes ?? "") === (b.notes ?? "");

async function main() {
  const db = scriptClient("read content reviews");
  const reviews = (await must(
    db.from("content_reviews").select("asset_id, status, reviewer_role, notes, created_at, content_assets(text)").order("created_at", { ascending: true }),
    "read reviews",
  )) as unknown as DbReview[];
  const byAsset = new Map<string, DbReview[]>();
  for (const r of reviews) byAsset.set(r.asset_id, [...(byAsset.get(r.asset_id) ?? []), r]);

  let changedLines = 0;
  let changedFiles = 0;
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const file of jsonFiles(join(root, "content"))) {
    const original = readFileSync(file, "utf8");
    const data = JSON.parse(original) as unknown;
    let changed = false;
    for (const line of linesIn(data)) {
      const list = byAsset.get(line.id);
      if (!list) continue;
      seen.add(line.id);
      const applicable = list.filter((r) => r.content_assets?.text === line.text);
      if (applicable.length < list.length) skipped.push(line.id);
      if (applicable.length === 0) continue;
      const history = [...(line.review.history ?? [])];
      for (const r of applicable) {
        const event: ReviewEvent = { status: r.status, role: r.reviewer_role, date: r.created_at.slice(0, 10), ...(r.notes ? { notes: r.notes } : {}) };
        if (!history.some((h) => sameEvent(h, event))) history.push(event);
      }
      const status = applicable[applicable.length - 1].status;
      if (status !== line.review.status || history.length !== (line.review.history ?? []).length) {
        line.review.status = status;
        line.review.history = history;
        changed = true;
        changedLines++;
      }
    }
    if (changed) {
      writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
      changedFiles++;
    }
  }

  const orphans = [...byAsset.keys()].filter((id) => !seen.has(id));
  console.log(`${reviews.length} review(s) in the database; updated ${changedLines} line(s) in ${changedFiles} file(s).`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} line(s) have reviews of an older text that were not applied (review them again):`);
    for (const id of skipped.slice(0, 20)) console.log(`  ${id}`);
  }
  if (orphans.length > 0) console.log(`${orphans.length} reviewed line(s) no longer exist in the content: ${orphans.slice(0, 10).join(", ")}`);
  if (changedFiles > 0) console.log("Next: git diff content/, npm run content:validate, commit, then npm run db:seed-content.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Copy the curriculum from content/ into the database, so staff reports,
 * completion evidence and the content review tool can refer to it.
 *
 *   npm run db:seed-content            (local Supabase)
 *   npm run db:seed-content -- --allow-remote   (only when authorised)
 *
 * The content files stay the source of truth. Review decisions made in the
 * review tool are stored in the database first; this script refuses to run
 * while any of them are missing from the files (run content:pull-reviews and
 * commit first), so a seed can never silently undo a reviewer's decision.
 * Pass --force to seed anyway.
 *
 * Also copies config/capabilities.json into provider_capabilities for audit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectAudioAssets } from "../src/lib/content/assets";
import { loadContent } from "../src/lib/content/load";
import { isExercise } from "../src/lib/content/schema";
import { exerciseKind, stepPathways, validateContent } from "../src/lib/content/validate";
import { evidenceFor } from "../src/lib/learning/evidence";
import { buildAudioIndex } from "./lib/audio";
import { hashContentTree } from "./lib/content-version";
import { inChunks, must, scriptClient } from "./lib/supabase";

const root = process.cwd();
const force = process.argv.includes("--force");

interface MatrixEntry {
  provider: string;
  language: string;
  capability: string;
  status: string;
  verifiedAt: string | null;
  verifierRole: string | null;
  learnerVisible: boolean;
  notes: string;
}

async function main() {
  const db = scriptClient("seed curriculum content");
  const { bundle, errors } = loadContent(root);
  if (!bundle) throw new Error(`content did not load:\n${errors.join("\n")}`);
  const report = validateContent(bundle);
  if (report.errors.length > 0) throw new Error(`content has ${report.errors.length} error(s); run npm run content:validate`);

  const assets = collectAudioAssets(bundle);
  const { index } = await buildAudioIndex(root, assets, { generate: false });
  const version = hashContentTree(root);
  const now = new Date().toISOString();

  // 1. Review decisions recorded since the last seed that the files do not have yet.
  const fileStatus = new Map(assets.map((a) => [a.id, { status: a.review, text: a.text }]));
  const seededAt = new Map(
    ((await must(db.from("content_assets").select("id, text"), "read content assets")) as { id: string; text: string }[]).map(
      (a) => [a.id, a],
    ),
  );
  const reviews = (await must(db.from("content_reviews").select("asset_id, status, created_at").order("created_at"), "read reviews")) as {
    asset_id: string;
    status: string;
    created_at: string;
  }[];
  const lastSeed = (await must(db.from("content_versions").select("seeded_at").order("seeded_at", { ascending: false }).limit(1), "read last seed")) as {
    seeded_at: string;
  }[];
  const since = lastSeed[0] ? Date.parse(lastSeed[0].seeded_at) : 0;
  const latest = new Map<string, string>();
  for (const r of reviews) if (Date.parse(r.created_at) > since) latest.set(r.asset_id, r.status);
  const unpulled = [...latest]
    .filter(([id, status]) => {
      const f = fileStatus.get(id);
      return f && f.text === seededAt.get(id)?.text && f.status !== status;
    })
    .map(([id, status]) => ({ id, review_status: status }));
  if (unpulled.length > 0 && !force) {
    console.error(`${unpulled.length} review decision(s) in the database are not in the content files yet, for example:`);
    for (const a of unpulled.slice(0, 5)) console.error(`  ${a.id}: database '${a.review_status}', file '${fileStatus.get(a.id)?.status}'`);
    console.error("Run npm run content:pull-reviews, review and commit the changes, then seed again (or pass --force).");
    process.exit(1);
  }

  // 2. Content version.
  await must(db.from("content_versions").upsert({ id: version, seeded_at: now, lesson_count: bundle.lessons.length, asset_count: assets.length }), "content version");

  // 3. Levels, units, lessons, objectives, exercises.
  await must(
    db.from("curriculum_levels").upsert(
      bundle.curriculum.levels.map((l) => ({ level: l.level, title: l.title, description: l.description, aet_level: l.aetLevel })),
    ),
    "levels",
  );
  await must(
    db.from("units").upsert(bundle.curriculum.units.map((u) => ({ id: u.id, level: u.level, sort_order: u.order, title_en: u.title.en }))),
    "units",
  );
  await must(
    db.from("lessons").upsert(
      bundle.lessons.map((l) => ({
        id: l.id,
        unit_id: l.unit,
        level: l.level,
        sort_order: l.order,
        version: l.version,
        title_en: l.title.en,
        summary: l.summary,
        target: l.target,
        minutes: l.minutes,
        prerequisites: l.prerequisites,
        contrastive_tags: l.contrastiveTags,
        content: l,
        content_version: version,
      })),
    ),
    "lessons",
  );
  const objectives = bundle.lessons.flatMap((l) =>
    l.objectives.map((o) => ({
      id: o.id,
      lesson_id: l.id,
      description: o.description,
      strand: o.strand,
      mastery_competencies: o.masteryCompetencies,
      reading: o.reading,
      contrastive_tags: o.contrastiveTags ?? [],
    })),
  );
  await must(db.from("learning_objectives").upsert(objectives), "objectives");
  const exercises = bundle.lessons.flatMap((l) =>
    l.steps.filter(isExercise).map((ex) => ({
      id: ex.id,
      lesson_id: l.id,
      type: ex.type,
      mode: "mode" in ex ? (ex.mode as string) : null,
      objective_ids: ex.objectives,
      evidence: evidenceFor(exerciseKind(ex)),
      pathways: stepPathways(ex),
      definition: ex,
    })),
  );
  await inChunks(exercises, 300, async (rows) => void (await must(db.from("exercises").upsert(rows), "exercises")));

  // 4. AET outcomes and the proposed mapping (always marked unreviewed until an accredited specialist reviews it).
  await must(
    db.from("aet_outcomes").upsert(
      [...bundle.aetOutcomes.values()].map((o) => ({
        id: o.id,
        level: o.level,
        learning_area: o.learningArea,
        outcome: o.outcome,
        official_reference: o.officialReference,
        status: o.status,
      })),
    ),
    "AET outcomes",
  );
  const objectiveIds = objectives.map((o) => o.id);
  await inChunks(objectiveIds, 200, async (ids) => void (await must(db.from("aet_mappings").delete().in("objective_id", ids), "clear AET mappings")));
  const mappings = bundle.lessons.flatMap((l) =>
    l.objectives.flatMap((o) =>
      o.aet.map((a) => ({
        objective_id: o.id,
        outcome_id: a.outcome,
        aet_level: a.level,
        review_status: bundle.aetOutcomes.get(a.outcome)?.status ?? "proposed_unreviewed",
      })),
    ),
  );
  await must(db.from("aet_mappings").insert(mappings), "AET mappings");

  // 5. Every spoken line with its review status and audio.
  const assetRows = assets.map((a) => {
    const audio = index.get(a.id);
    return {
      id: a.id,
      kind: a.kind,
      language: a.lang,
      text: a.text,
      context_note: a.note ?? null,
      usage: a.usage,
      lesson_id: a.lessonId ?? null,
      review_status: a.review,
      audio_url: audio?.src ?? null,
      audio_placeholder: audio?.placeholder ?? true,
      content_version: version,
      updated_at: now,
    };
  });
  await inChunks(assetRows, 400, async (rows) => void (await must(db.from("content_assets").upsert(rows), "content assets")));

  // 6. Remove what is no longer in the content.
  const keep = {
    exercises: new Set(exercises.map((e) => e.id)),
    lessons: new Set(bundle.lessons.map((l) => l.id)),
    assets: new Set(assets.map((a) => a.id)),
  };
  const stale = async (table: string, ids: Set<string>) => {
    const rows = (await must(db.from(table).select("id"), `list ${table}`)) as { id: string }[];
    const gone = rows.map((r) => r.id).filter((id) => !ids.has(id));
    await inChunks(gone, 200, async (chunk) => void (await must(db.from(table).delete().in("id", chunk), `remove stale ${table}`)));
    return gone.length;
  };
  const removed = {
    exercises: await stale("exercises", keep.exercises),
    lessons: await stale("lessons", keep.lessons),
    assets: await stale("content_assets", keep.assets),
  };

  // 7. Provider capability matrix (audit copy; the app reads the file itself).
  const matrix = JSON.parse(readFileSync(join(root, "config", "capabilities.json"), "utf8")) as { version: string; entries: MatrixEntry[] };
  await must(db.from("provider_capabilities").delete().neq("provider", ""), "clear capability matrix");
  await must(
    db.from("provider_capabilities").insert(
      matrix.entries.map((e) => ({
        provider: e.provider,
        language: e.language,
        capability: e.capability,
        status: e.status,
        verified_at: e.verifiedAt,
        verifier_role: e.verifierRole,
        learner_visible: e.learnerVisible,
        notes: e.notes,
        matrix_version: matrix.version,
      })),
    ),
    "capability matrix",
  );

  console.log(`Seeded content ${version}: ${bundle.lessons.length} lessons, ${objectives.length} objectives, ${exercises.length} exercises, ${assets.length} spoken lines, ${mappings.length} AET mappings, ${matrix.entries.length} capability entries.`);
  if (removed.exercises + removed.lessons + removed.assets > 0) {
    console.log(`Removed content no longer in the files: ${removed.lessons} lessons, ${removed.exercises} exercises, ${removed.assets} spoken lines.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Generate the AET alignment document and review sheet from the content:
 *   docs/aet-alignment.md   (readable mapping, for organisations and reviewers)
 *   docs/aet-alignment.csv  (one row per mapping, for an accredited AET specialist)
 *
 *   npm run docs:aet            write both files
 *   npm run docs:aet -- --check fail if they are out of date (CI)
 *
 * The mapping is proposed by the product team and is NOT accredited. Every
 * output says so and keeps saying so until outcomes are marked
 * 'specialist_reviewed' (with an official reference) in content/aet/outcomes.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "../src/lib/content/load";

const root = process.cwd();
const check = process.argv.includes("--check");

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const mdCell = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");

function generate(): { md: string; csv: string } {
  const { bundle, errors } = loadContent(root);
  if (!bundle) throw new Error(`content did not load:\n${errors.join("\n")}`);
  const outcomes = [...bundle.aetOutcomes.values()];
  const reviewed = outcomes.filter((o) => o.status === "specialist_reviewed").length;
  const levelOrder = ["pre-aet", "aet-1", "aet-2", "aet-3", "aet-4"];
  const lessons = [...bundle.lessons].sort((a, b) => a.level - b.level || a.order - b.order);

  const rows = lessons.flatMap((l) =>
    l.objectives.flatMap((o) =>
      o.aet.map((a) => {
        const outcome = bundle.aetOutcomes.get(a.outcome);
        return {
          lesson: l,
          objective: o,
          aetLevel: a.level,
          outcomeId: a.outcome,
          outcome: outcome?.outcome ?? "(unknown outcome)",
          learningArea: outcome?.learningArea ?? "",
          officialReference: outcome?.officialReference ?? "",
          status: outcome?.status ?? "proposed_unreviewed",
        };
      }),
    ),
  );

  const md: string[] = [];
  md.push("# AET alignment (proposed, not accredited)");
  md.push("");
  md.push("> **Requires review by an accredited AET specialist.** This document is generated from the content files by `npm run docs:aet`; do not edit it by hand.");
  md.push(">");
  md.push(`> ${bundle.aetDisclaimer}`);
  md.push("");
  md.push(
    `Status: ${reviewed} of ${outcomes.length} outcome descriptors have been reviewed by an accredited AET specialist. Until an outcome is reviewed, every report, export and certificate that mentions it carries the words "proposed mapping, not accredited".`,
  );
  md.push("");
  md.push("## How the levels relate");
  md.push("");
  md.push("| App level | Title | Proposed AET level | Description |");
  md.push("|---|---|---|---|");
  for (const lv of bundle.curriculum.levels) md.push(`| ${lv.level} | ${mdCell(lv.title)} | ${lv.aetLevel} | ${mdCell(lv.description)} |`);
  md.push("");
  md.push("## Outcomes and the objectives mapped to them");
  for (const level of levelOrder) {
    const here = outcomes.filter((o) => o.level === level);
    if (here.length === 0) continue;
    md.push("");
    md.push(`### ${level.toUpperCase()}`);
    for (const o of here) {
      md.push("");
      md.push(`#### \`${o.id}\``);
      md.push("");
      md.push(`- Learning area: ${o.learningArea}`);
      md.push(`- Outcome (proposed wording): ${o.outcome}`);
      md.push(`- Official reference: ${o.officialReference ?? "not yet identified (to be supplied by the specialist)"}`);
      md.push(`- Review status: ${o.status === "specialist_reviewed" ? "reviewed by an accredited AET specialist" : "proposed, unreviewed"}`);
      const mapped = rows.filter((r) => r.outcomeId === o.id);
      if (mapped.length === 0) {
        md.push("- Mapped objectives: none");
        continue;
      }
      md.push("");
      md.push("| Lesson | Objective | Strand | Mastery needs |");
      md.push("|---|---|---|---|");
      for (const r of mapped) {
        md.push(
          `| ${r.lesson.id}: ${mdCell(r.lesson.title.en)} | ${mdCell(r.objective.description)} | ${r.objective.strand} | ${r.objective.masteryCompetencies.join(", ")}${r.objective.reading ? " (independent decoding required)" : ""} |`,
        );
      }
    }
  }
  md.push("");
  md.push("## For the reviewing specialist");
  md.push("");
  md.push("Use `docs/aet-alignment.csv` (one row per proposed mapping). For each row, please record whether the mapping is appropriate, the correct AET level, and the official reference (for example a SAQA unit standard or the relevant curriculum document). The product team then updates `content/aet/outcomes.json` (`officialReference`, `status: \"specialist_reviewed\"`) and the lesson objectives, and regenerates this document. Please also check:");
  md.push("");
  md.push("1. That the Level 0 home-language bridge is described as preparation, not as an AET outcome in English.");
  md.push("2. That reading objectives, which the app only counts as mastered on independent decoding evidence, match the outcome wording.");
  md.push("3. That listening and repeating tasks (recorded as \"practised\", never scored) are not mapped to speaking outcomes as if assessed.");
  md.push("4. Whether completion evidence from the app could count towards any formal assessment, and what moderation it would need.");
  md.push("");

  const header = [
    "objective_id",
    "lesson_id",
    "lesson_title",
    "objective",
    "strand",
    "mastery_competencies",
    "proposed_aet_level",
    "outcome_id",
    "learning_area",
    "proposed_outcome",
    "official_reference",
    "status",
    "specialist_decision",
    "specialist_level",
    "specialist_reference",
    "specialist_notes",
  ];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.objective.id,
        r.lesson.id,
        r.lesson.title.en,
        r.objective.description,
        r.objective.strand,
        r.objective.masteryCompetencies.join(" "),
        r.aetLevel,
        r.outcomeId,
        r.learningArea,
        r.outcome,
        r.officialReference,
        r.status,
        "",
        "",
        "",
        "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

  return { md: md.join("\n"), csv: `${csv}\n` };
}

const { md, csv } = generate();
const files = { "docs/aet-alignment.md": md, "docs/aet-alignment.csv": csv };
if (check) {
  const stale = Object.entries(files).filter(([f, text]) => !existsSync(join(root, f)) || readFileSync(join(root, f), "utf8") !== text);
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([f]) => f).join(", ")}. Run npm run docs:aet and commit.`);
    process.exit(1);
  }
  console.log("AET alignment documents are up to date.");
} else {
  for (const [f, text] of Object.entries(files)) writeFileSync(join(root, f), text);
  console.log(`Wrote ${Object.keys(files).join(" and ")}.`);
}

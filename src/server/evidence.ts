import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Catalog } from "@/lib/content/compiled";
import type { CompetencyState } from "@/lib/learning/types";
import { aetOutcomes, aetStatusText } from "./aet";

/**
 * Completion evidence for a class: objectives each learner has mastered (only
 * learners who chose to share mastery), with the date and the kind of
 * evidence, and the proposed AET alignment clearly marked as not accredited.
 */
export interface EvidenceRow {
  learner_id: string;
  avatar_id: string;
  nickname: string | null;
  objective_id: string;
  status: string;
  first_mastered_at: string;
  competencies: Partial<Record<string, CompetencyState>>;
}
export interface AssessmentRow {
  learner_id: string;
  kind: string;
  instrument: string;
  skipped: boolean;
  scores: Record<string, { correct: number; total: number }>;
  placed_level: number;
  completed_at: string;
}

const COMPETENCY_TEXT: Record<string, string> = {
  recognise: "recognises",
  understand_spoken: "understands spoken",
  repeat: "repeats (practised, not scored)",
  decode: "reads independently",
  understand_written: "understands written",
  write: "writes",
};

export function learnerLabel(r: { nickname: string | null; avatar_id: string; learner_id: string }): string {
  return `${r.nickname ?? "Learner"} (${r.avatar_id.replace("avatar-", "")} picture, ref ${r.learner_id.slice(0, 8)})`;
}

export function evidenceText(competencies: EvidenceRow["competencies"]): string {
  return Object.entries(competencies)
    .filter(([, c]) => c?.status === "mastered")
    .map(([k, c]) => `${COMPETENCY_TEXT[k] ?? k}: ${c!.correct} correct of ${c!.events}`)
    .join("; ");
}

function objectiveIndex(catalog: Catalog) {
  const map = new Map<string, { description: string; lessonId: string; lessonTitle: string; strand: string; aet: { level: string; outcome: string }[] }>();
  for (const l of catalog.lessons) {
    for (const o of l.objectives) map.set(o.id, { description: o.description, lessonId: l.id, lessonTitle: l.title.en, strand: o.strand, aet: o.aet });
  }
  return map;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function evidenceCsv(rows: EvidenceRow[], catalog: Catalog): string {
  const objectives = objectiveIndex(catalog);
  const { outcomes } = aetOutcomes();
  const header = [
    "learner",
    "learner_ref",
    "objective_id",
    "objective",
    "lesson",
    "strand",
    "mastered_on",
    "evidence",
    "aet_level_proposed",
    "aet_outcome_proposed",
    "aet_mapping_status",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const o = objectives.get(r.objective_id);
    const links = o?.aet.length ? o.aet : [{ level: "", outcome: "" }];
    for (const link of links) {
      const outcome = outcomes.get(link.outcome);
      lines.push(
        [
          r.nickname ?? "Learner",
          r.learner_id.slice(0, 8),
          r.objective_id,
          o?.description ?? "",
          o ? `${o.lessonId}: ${o.lessonTitle}` : "",
          o?.strand ?? "",
          r.first_mastered_at.slice(0, 10),
          evidenceText(r.competencies),
          link.level,
          outcome?.outcome ?? "",
          aetStatusText(outcome),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** pdf-lib's standard fonts cover Latin-1 only: replace anything else. */
const latin1 = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage([595.28, 841.89]);
    this.y = 800;
  }
  private ensure(height: number) {
    if (this.y - height < 50) {
      this.page = this.doc.addPage([595.28, 841.89]);
      this.y = 800;
    }
  }
  text(s: string, opts: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const x = 50 + (opts.indent ?? 0);
    const width = 545 - x;
    const words = latin1(s).split(/\s+/);
    let line = "";
    const flush = () => {
      this.ensure(size + 4);
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ? rgb(...opts.color) : rgb(0.12, 0.16, 0.22) });
      this.y -= size + 4;
      line = "";
    };
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        flush();
        line = w;
      } else line = next;
    }
    if (line) flush();
  }
  gap(h = 8) {
    this.y -= h;
  }
}

export async function evidencePdf(input: {
  cohortName: string;
  organisationName: string;
  rows: EvidenceRow[];
  assessments: AssessmentRow[];
  catalog: Catalog;
  generatedAt: Date;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Completion evidence: ${input.cohortName}`);
  doc.setProducer("Yomu");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const objectives = objectiveIndex(input.catalog);
  const { outcomes, disclaimer } = aetOutcomes();

  w.text("Completion evidence", { size: 18, bold: true });
  w.text(`${input.cohortName} - ${input.organisationName}`, { size: 12 });
  w.text(`Generated ${input.generatedAt.toISOString().slice(0, 10)}. Only learners who chose to share their mastery are included.`, { size: 9 });
  w.gap();
  w.text("About the AET alignment", { bold: true, color: [0.6, 0.27, 0.02] });
  w.text(disclaimer, { size: 9, color: [0.6, 0.27, 0.02] });
  w.text(
    "How mastery is decided: an objective counts as mastered only after repeated correct first attempts across lessons; reading objectives need independent decoding (no audio or help that reveals the answer). Listen-and-repeat practice is recorded as practised and never scored.",
    { size: 9 },
  );
  w.gap(12);

  const byLearner = new Map<string, EvidenceRow[]>();
  for (const r of input.rows) byLearner.set(r.learner_id, [...(byLearner.get(r.learner_id) ?? []), r]);
  if (byLearner.size === 0) w.text("No learner in this class has shared mastered objectives yet.");
  for (const [learnerId, rows] of byLearner) {
    w.text(learnerLabel(rows[0]), { size: 12, bold: true });
    for (const a of input.assessments.filter((x) => x.learner_id === learnerId)) {
      w.text(`${a.kind} assessment (${a.instrument}) on ${a.completed_at.slice(0, 10)}: ${a.skipped ? "self-reported, " : ""}started at level ${a.placed_level}`, { size: 9, indent: 10 });
    }
    for (const r of rows) {
      const o = objectives.get(r.objective_id);
      w.text(`${r.first_mastered_at.slice(0, 10)}  ${o?.description ?? r.objective_id}`, { size: 10, indent: 10 });
      w.text(`Lesson ${o ? `${o.lessonId}: ${o.lessonTitle}` : "?"}. Evidence: ${evidenceText(r.competencies) || "mastered"}.`, { size: 8, indent: 24 });
      for (const link of o?.aet ?? []) {
        const outcome = outcomes.get(link.outcome);
        w.text(`AET (${aetStatusText(outcome)}): ${link.level.toUpperCase()} - ${outcome?.outcome ?? link.outcome}`, { size: 8, indent: 24, color: [0.6, 0.27, 0.02] });
      }
    }
    w.gap(10);
  }
  return doc.save();
}

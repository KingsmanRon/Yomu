import { describe, expect, it } from "vitest";
import type { Catalog } from "@/lib/content/compiled";
import { evidenceCsv, evidencePdf, evidenceText, type EvidenceRow } from "@/server/evidence";
import { aggregateMetrics, MIN_GROUP, metricsCsv } from "@/server/metrics";
import { compiledContent } from "./compiled-fixture";

const catalog: Catalog = compiledContent().catalog;
const objective = catalog.lessons.flatMap((l) => l.objectives).find((o) => o.aet.length > 0)!;

const learner = (language: "zu" | "st", over: Partial<Parameters<typeof aggregateMetrics>[0]["learners"][number]> = {}) => ({
  language,
  level: 1,
  lessonsCompleted: 3,
  objectivesMastered: 1,
  longestStreak: 2,
  lastActive: "2026-10-20",
  activeDays: 4,
  placedLevel: 1,
  placementSelfReported: false,
  ...over,
});

describe("pilot metrics", () => {
  const input = {
    learners: [...Array.from({ length: 6 }, () => learner("zu")), ...Array.from({ length: 3 }, () => learner("st", { lessonsCompleted: 10 }))],
    attempts: Array.from({ length: 40 }, (_, i) => ({
      language: "zu" as const,
      exerciseType: "picture_match",
      outcome: i % 4 === 0 ? ("incorrect" as const) : ("correct" as const),
      firstAttempt: true,
      revision: false,
      supported: false,
    })),
    lessonBytes: Array.from({ length: 6 }, () => ({ language: "zu" as const, bytes: 300 * 1024 })),
    tutorByTier: [],
    today: "2026-10-27",
  };
  const rows = aggregateMetrics(input);
  const get = (metric: string, group: string) => rows.find((r) => r.metric === metric && r.group === group)?.value;

  it("suppresses any group smaller than the minimum", () => {
    expect(get("learners_registered", "st")).toBe(`<${MIN_GROUP}`);
    expect(get("details_suppressed", "st")).toBeDefined();
    expect(rows.filter((r) => r.group === "st")).toHaveLength(2);
  });

  it("reports aggregates for larger groups", () => {
    expect(get("learners_registered", "zu")).toBe(6);
    expect(get("learners_registered", "all")).toBe(9);
    expect(get("first_try_accuracy_picture_match", "zu")).toBe(75);
    expect(get("median_kb_downloaded_per_lesson", "zu")).toBe(300);
    expect(get("active_last_7_days", "zu")).toBe(6);
    expect(get("learners_with_lessons_10_plus", "all")).toBe(`<${MIN_GROUP}`);
  });

  it("never contains identifiers", () => {
    const csv = metricsCsv(rows);
    expect(csv.split("\n")[0]).toBe("metric,group,value,note");
    expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe("completion evidence", () => {
  const row: EvidenceRow = {
    learner_id: "1b2c3d4e-0000-4000-8000-000000000001",
    avatar_id: "avatar-sun",
    nickname: "Thabo 🙂",
    objective_id: objective.id,
    status: "mastered",
    first_mastered_at: "2026-10-20T08:00:00Z",
    competencies: { decode: { status: "mastered", events: 4, correct: 4 }, recognise: { status: "developing", events: 2, correct: 1 } },
  };

  it("describes only mastered competencies, with their evidence", () => {
    expect(evidenceText(row.competencies)).toBe("reads independently: 4 correct of 4");
  });

  it("marks every AET mapping as proposed and not accredited", () => {
    const csv = evidenceCsv([row], catalog);
    const [header, ...lines] = csv.trim().split("\n");
    expect(header).toContain("aet_mapping_status");
    expect(lines.length).toBe(objective.aet.length);
    for (const l of lines) expect(l).toContain("proposed mapping, not accredited");
    expect(csv).toContain(objective.description.slice(0, 30));
    expect(csv).toContain("1b2c3d4e");
    expect(csv).not.toContain("0000-4000-8000");
  });

  it("produces a PDF even when a nickname has characters the PDF font cannot draw", async () => {
    const pdf = await evidencePdf({ cohortName: "Morning class", organisationName: "Demo", rows: [row], assessments: [], catalog, generatedAt: new Date("2026-10-27") });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

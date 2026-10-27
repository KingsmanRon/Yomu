import { describe, expect, it } from "vitest";
import type { Catalog } from "@/lib/content/compiled";
import { evidenceCsv, evidencePdf, evidenceText, type EvidenceRow } from "@/server/evidence";
import { aggregateMetrics, MIN_GROUP, metricsCsv, prePostPair } from "@/server/metrics";
import { compiledContent } from "./compiled-fixture";

const catalog: Catalog = compiledContent().catalog;
const objective = catalog.lessons.flatMap((l) => l.objectives).find((o) => o.aet.length > 0)!;

type Input = Parameters<typeof aggregateMetrics>[0];
type Learner = Input["learners"][number];
let nextLearner = 0;

const learner = (language: "zu" | "st", over: Partial<Learner> = {}): Learner => ({
  language,
  pseudonym: `l_${language}${++nextLearner}`,
  level: 1,
  lessonsCompleted: 3,
  completions: 4,
  objectivesMastered: 1,
  longestStreak: 2,
  lastActive: "2026-10-20",
  activeDays: 4,
  activityDates: ["2026-10-13", "2026-10-14", "2026-10-20"],
  placedLevel: 1,
  placementSelfReported: false,
  prePost: null,
  ...over,
});

const attempt = (learnerIndex: number, exerciseId: string, correct: boolean): Input["attempts"][number] => ({
  language: "zu",
  learner: learnerIndex,
  exerciseId,
  exerciseType: "picture_match",
  outcome: correct ? "correct" : "incorrect",
  firstAttempt: true,
  revision: false,
  supported: false,
});

describe("pilot metrics", () => {
  const zu = Array.from({ length: 6 }, () => learner("zu"));
  const st = Array.from({ length: 3 }, () => learner("st", { lessonsCompleted: 10 }));
  const input: Input = {
    learners: [...zu, ...st],
    attempts: Array.from({ length: 40 }, (_, i) => attempt(Math.floor(i / 4) % 6, `l21.e0${i % 4}`, i % 4 !== 0)),
    lessonBytes: Array.from({ length: 6 }, () => ({ language: "zu" as const, bytes: 300 * 1024 })),
    tutorByTier: [],
    unanswered: [],
    events: [],
    today: "2026-10-27",
  };
  const rows = aggregateMetrics(input);
  const get = (metric: string, group: string, r = rows) => r.find((x) => x.metric === metric && x.group === group);

  it("suppresses any group smaller than the minimum", () => {
    expect(get("learners_registered", "st")?.value).toBe(`<${MIN_GROUP}`);
    expect(get("details_suppressed", "st")).toBeDefined();
    expect(rows.filter((r) => r.group === "st")).toHaveLength(2);
  });

  it("reports aggregates for larger groups", () => {
    expect(get("learners_registered", "zu")?.value).toBe(6);
    expect(get("learners_registered", "all")?.value).toBe(9);
    expect(get("first_try_accuracy_picture_match", "zu")?.value).toBe(75);
    expect(get("mean_kb_downloaded_per_lesson", "zu")?.value).toBe(300);
    expect(get("median_kb_downloaded_per_lesson", "zu")?.value).toBe(300);
    expect(get("active_last_7_days", "zu")?.value).toBe(6);
    expect(get("learners_with_lessons_10_plus", "all")?.value).toBe(`<${MIN_GROUP}`);
    expect(get("completed_a_lesson", "zu")?.value).toBe(6);
  });

  it("names the exercises failed most, only when enough learners tried them", () => {
    // l21.e00 is wrong on every first try, by all six learners; the others are always right.
    expect(get("most_failed_exercise_1", "zu")?.value).toBe("l21.e00 (picture_match)");
    expect(get("most_failed_exercise_1", "zu")?.note).toContain("100% wrong");
    expect(get("most_failed_exercise_2", "zu")).toBeUndefined();
    const few = aggregateMetrics({ ...input, attempts: input.attempts.map((a) => ({ ...a, learner: a.learner % 2 })) });
    expect(get("most_failed_exercise_1", "zu", few)).toBeUndefined();
  });

  it("compares the entry assessment with a later retake, section by section", () => {
    const pair = (pre: number, post: number) => ({
      daysBetween: 42,
      pre: { letter_sounds: { correct: pre, total: 3 } },
      post: { letter_sounds: { correct: post, total: 3 } },
    });
    const learners = [...[1, 1, 2, 0, 1].map((pre) => learner("zu", { prePost: pair(pre, 3) })), learner("zu", { prePost: pair(3, 3) })];
    const r = aggregateMetrics({ ...input, learners });
    expect(get("pre_post_pairs", "zu", r)?.value).toBe(6);
    expect(get("median_days_between_pre_and_post", "zu", r)?.value).toBe(42);
    expect(get("pre_letter_sounds_median_pct", "zu", r)?.value).toBe(33);
    expect(get("post_letter_sounds_median_pct", "zu", r)?.value).toBe(100);
    expect(get("change_letter_sounds_median_points", "zu", r)?.value).toBe(67);
    expect(get("improved_letter_sounds", "zu", r)?.value).toBe(5);
    // Sections not taken at both points are not reported.
    expect(get("pre_sight_words_median_pct", "zu", r)).toBeUndefined();
  });

  it("pairs the first assessment actually taken with the latest retake of the same instrument", () => {
    const a = (kind: string, completedAt: string, over: Partial<Parameters<typeof prePostPair>[0][number]> = {}) => ({
      kind,
      instrument: "placement-v1",
      skipped: false,
      scores: { letter_sounds: { correct: 1, total: 3 } },
      completedAt,
      ...over,
    });
    // A skipped placement is not an entry measure; a retake on the first day is.
    expect(
      prePostPair([a("placement", "2026-09-01T08:00:00Z", { skipped: true, scores: {} }), a("retake", "2026-09-01T09:00:00Z"), a("retake", "2026-10-13T08:00:00Z")])?.daysBetween,
    ).toBe(42);
    expect(prePostPair([a("placement", "2026-09-01T08:00:00Z"), a("retake", "2026-09-05T08:00:00Z")])).toBeNull();
    expect(prePostPair([a("placement", "2026-09-01T08:00:00Z"), a("retake", "2026-10-13T08:00:00Z", { instrument: "placement-v2" })])).toBeNull();
    expect(prePostPair([a("placement", "2026-09-01T08:00:00Z"), a("retake", "2026-09-20T08:00:00Z"), a("retake", "2026-10-13T08:00:00Z")])?.daysBetween).toBe(42);
  });

  it("measures retention after 7 and 30 days, and lessons per active week", () => {
    const learners = [
      ...Array.from({ length: 4 }, () => learner("zu", { activityDates: ["2026-09-01", "2026-09-09", "2026-10-02"], completions: 6 })),
      ...Array.from({ length: 2 }, () => learner("zu", { activityDates: ["2026-09-01"], completions: 1 })),
    ];
    const r = aggregateMetrics({ ...input, learners });
    expect(get("started_7_or_more_days_ago", "zu", r)?.value).toBe(6);
    expect(get("still_learning_after_day_7", "zu", r)?.value).toBe(`<${MIN_GROUP}`);
    expect(get("retention_day_7_pct", "zu", r)?.value).toBe(67);
    expect(get("retention_day_30_pct", "zu", r)?.value).toBe(67);
    // Three different weeks with 6 completions: 2 per active week; one week with 1: 1.
    expect(get("median_lessons_per_active_week", "zu", r)?.value).toBe(2);
  });

  it("ranks unanswered tutor questions by step and intent", () => {
    const u = (exerciseId: string, intent: string) => ({ language: "zu" as const, lessonId: "l20-blending", exerciseId, intent });
    const r = aggregateMetrics({ ...input, unanswered: [u("l20-blending.e03", "unknown"), u("l20-blending.e03", "unknown"), u("l20-blending.e05", "unknown")] });
    expect(get("tutor_unanswered_questions", "zu", r)?.value).toBe(3);
    expect(get("most_unanswered_1", "zu", r)).toMatchObject({ value: "l20-blending.e03: unknown", note: "2 questions" });
  });

  it("counts usage only for learners who agreed to it, as unique learners", () => {
    const ev = (l: Learner, event: string, props: Record<string, unknown> = {}) => ({ pseudonym: l.pseudonym, event, props });
    const events = [
      ...zu.flatMap((l) => [ev(l, "onboarding_step", { step: "welcome" }), ev(l, "onboarding_step", { step: "welcome" }), ev(l, "lesson_start", { lessonId: "l10-satp" })]),
      ...zu.slice(0, 3).map((l) => ev(l, "lesson_complete", { lessonId: "l10-satp" })),
      ...zu.slice(3).map((l) => ev(l, "lesson_exit", { lessonId: "l10-satp", stepId: "l10-satp.e04", stepType: "letter_sound" })),
      ev(zu[0], "tutor_help", { option: "slow" }),
      // An event of someone not registered here is ignored.
      { pseudonym: "l_unknown", event: "onboarding_step", props: { step: "welcome" } },
    ];
    const r = aggregateMetrics({ ...input, events });
    expect(get("learners_sharing_usage_counts", "zu", r)?.value).toBe(6);
    expect(get("onboarding_reached_welcome", "zu", r)?.value).toBe(6);
    expect(get("lesson_finished_pct_l10-satp", "zu", r)?.value).toBe(50);
    expect(get("most_common_exit_1", "zu", r)).toMatchObject({ value: "l10-satp.e04 (letter_sound)", note: `3 exits by <${MIN_GROUP} learners` });
    expect(get("help_requests_slow", "zu", r)?.value).toBe(1);
    // Too few learners share usage counts in Sesotho: nothing about their usage is reported.
    const stOnly = aggregateMetrics({ ...input, learners: [...zu, ...Array.from({ length: 5 }, () => learner("st"))], events: [ev(zu[0], "onboarding_step", { step: "welcome" })] });
    expect(get("learners_sharing_usage_counts", "zu", stOnly)?.value).toBe(`<${MIN_GROUP}`);
    expect(get("onboarding_reached_welcome", "zu", stOnly)).toBeUndefined();
  });

  it("never contains identifiers", () => {
    const events = zu.map((l) => ({ pseudonym: l.pseudonym, event: "onboarding_step", props: { step: "welcome" } }));
    const csv = metricsCsv(aggregateMetrics({ ...input, events }));
    expect(csv.split("\n")[0]).toBe("metric,group,value,note");
    expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    for (const l of input.learners) expect(csv).not.toContain(l.pseudonym);
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

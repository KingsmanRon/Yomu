import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Anonymised pilot measures. Only aggregates leave the database: no names,
 * nicknames, pseudonyms or learner IDs, and any figure that describes fewer
 * than MIN_GROUP learners is suppressed, so no individual can be singled out.
 */
export const MIN_GROUP = 5;

export interface MetricRow {
  metric: string;
  group: "all" | "zu" | "st";
  value: number | string;
  note?: string;
}

interface LearnerFacts {
  language: "zu" | "st";
  level: number;
  lessonsCompleted: number;
  objectivesMastered: number;
  longestStreak: number;
  lastActive: string | null;
  activeDays: number;
  placedLevel: number | null;
  placementSelfReported: boolean | null;
}

interface AttemptFacts {
  language: "zu" | "st";
  exerciseType: string;
  outcome: "correct" | "incorrect" | "practised";
  firstAttempt: boolean;
  revision: boolean;
  supported: boolean;
}

const daysAgo = (today: string, n: number) => new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10);

function suppress(count: number): number | string {
  return count > 0 && count < MIN_GROUP ? `<${MIN_GROUP}` : count;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pure aggregation, unit-tested without a database. */
export function aggregateMetrics(input: {
  learners: LearnerFacts[];
  attempts: AttemptFacts[];
  lessonBytes: { language: "zu" | "st"; bytes: number }[];
  tutorByTier: { language: "zu" | "st"; tier: number }[];
  today: string;
}): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const group of ["all", "zu", "st"] as const) {
    const ls = input.learners.filter((l) => group === "all" || l.language === group);
    const n = ls.length;
    const add = (metric: string, value: number | string, note?: string) => rows.push({ metric, group, value, note });
    add("learners_registered", suppress(n));
    if (n < MIN_GROUP) {
      add("details_suppressed", `fewer than ${MIN_GROUP} learners`);
      continue;
    }
    // Placement and level.
    const placed = ls.filter((l) => l.placedLevel !== null);
    add("placement_completed", suppress(placed.length));
    add("placement_self_reported", suppress(placed.filter((l) => l.placementSelfReported).length), "skipped the activity and answered one spoken question");
    for (let level = 0; level <= 5; level++) {
      add(`placed_at_level_${level}`, suppress(placed.filter((l) => l.placedLevel === level).length));
      add(`current_level_${level}`, suppress(ls.filter((l) => l.level === level).length));
    }
    // Engagement and retention.
    add("active_last_7_days", suppress(ls.filter((l) => l.lastActive && l.lastActive >= daysAgo(input.today, 7)).length));
    add("active_last_30_days", suppress(ls.filter((l) => l.lastActive && l.lastActive >= daysAgo(input.today, 30)).length));
    add("learned_on_5_or_more_days", suppress(ls.filter((l) => l.activeDays >= 5).length));
    add("learned_on_10_or_more_days", suppress(ls.filter((l) => l.activeDays >= 10).length));
    add("median_active_days", median(ls.map((l) => l.activeDays)));
    add("median_longest_streak_days", median(ls.map((l) => l.longestStreak)));
    // Learning.
    add("median_lessons_completed", median(ls.map((l) => l.lessonsCompleted)));
    for (const [label, lo, hi] of [["0", 0, 0], ["1_to_2", 1, 2], ["3_to_5", 3, 5], ["6_to_9", 6, 9], ["10_plus", 10, Infinity]] as const) {
      add(`learners_with_lessons_${label}`, suppress(ls.filter((l) => l.lessonsCompleted >= lo && l.lessonsCompleted <= hi).length));
    }
    add("median_objectives_mastered", median(ls.map((l) => l.objectivesMastered)));
    add("learners_with_any_objective_mastered", suppress(ls.filter((l) => l.objectivesMastered > 0).length));
    // First-attempt accuracy by exercise type (independent, first tries only).
    const at = input.attempts.filter((a) => (group === "all" || a.language === group) && a.firstAttempt && a.outcome !== "practised");
    const types = [...new Set(at.map((a) => a.exerciseType))].sort();
    for (const t of types) {
      const of = at.filter((a) => a.exerciseType === t && !a.revision && !a.supported);
      if (of.length >= MIN_GROUP * 4) add(`first_try_accuracy_${t}`, Math.round((of.filter((a) => a.outcome === "correct").length / of.length) * 100), "% correct, unsupported first tries in lessons");
    }
    const rev = at.filter((a) => a.revision);
    add("revision_items_answered", rev.length);
    if (rev.length >= MIN_GROUP * 4) add("revision_accuracy", Math.round((rev.filter((a) => a.outcome === "correct").length / rev.length) * 100), "% correct");
    add("listen_and_repeat_practised", input.attempts.filter((a) => (group === "all" || a.language === group) && a.outcome === "practised").length, "practice is never scored");
    // Cost to the learner: mobile data per lesson.
    const bytes = input.lessonBytes.filter((b) => group === "all" || b.language === group).map((b) => b.bytes);
    if (bytes.length >= MIN_GROUP) add("median_kb_downloaded_per_lesson", Math.round(median(bytes) / 1024), "measured on the phone while the lesson was open");
    // Tutor use.
    const tutor = input.tutorByTier.filter((t) => group === "all" || t.language === group);
    add("tutor_spoken_questions_tier2", tutor.filter((t) => t.tier === 2).length);
    add("tutor_generated_answers_tier3", tutor.filter((t) => t.tier === 3).length);
  }
  return rows;
}

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function pilotMetrics(today: string): Promise<MetricRow[]> {
  const db = supabaseAdmin();
  const [learners, progress, placements, streakDays, attempts, completions, tutor] = await Promise.all([
    all<{ id: string; teaching_language: "zu" | "st"; current_level: number }>((f, t) => db.from("learners").select("id, teaching_language, current_level").range(f, t)),
    all<{ learner_id: string; lessons_completed: number; objectives_mastered: number; longest_streak: number; last_active_date: string | null; current_level: number }>((f, t) =>
      db.from("learner_progress").select("learner_id, lessons_completed, objectives_mastered, longest_streak, last_active_date, current_level").range(f, t),
    ),
    all<{ learner_id: string; placed_level: number; skipped: boolean; completed_at: string }>((f, t) =>
      db.from("assessment_results").select("learner_id, placed_level, skipped, completed_at").eq("kind", "placement").order("completed_at").range(f, t),
    ),
    all<{ learner_id: string }>((f, t) => db.from("streak_days").select("learner_id").eq("kind", "active").range(f, t)),
    all<{ learner_id: string; exercise_type: string; outcome: "correct" | "incorrect" | "practised"; attempt_number: number; revision: boolean; supported: boolean }>((f, t) =>
      db.from("learning_attempts").select("learner_id, exercise_type, outcome, attempt_number, revision, supported").range(f, t),
    ),
    all<{ learner_id: string; data_bytes: number | null }>((f, t) => db.from("lesson_completions").select("learner_id, data_bytes").range(f, t)),
    all<{ language: "zu" | "st"; tier: number }>((f, t) => db.from("tutor_logs").select("language, tier").range(f, t)),
  ]);
  const lang = new Map(learners.map((l) => [l.id, l.teaching_language]));
  const prog = new Map(progress.map((p) => [p.learner_id, p]));
  const firstPlacement = new Map<string, { placed_level: number; skipped: boolean }>();
  for (const p of placements) if (!firstPlacement.has(p.learner_id)) firstPlacement.set(p.learner_id, p);
  const activeDays = new Map<string, number>();
  for (const s of streakDays) activeDays.set(s.learner_id, (activeDays.get(s.learner_id) ?? 0) + 1);

  return aggregateMetrics({
    learners: learners.map((l) => {
      const p = prog.get(l.id);
      const pl = firstPlacement.get(l.id);
      return {
        language: l.teaching_language,
        level: p?.current_level ?? l.current_level,
        lessonsCompleted: p?.lessons_completed ?? 0,
        objectivesMastered: p?.objectives_mastered ?? 0,
        longestStreak: p?.longest_streak ?? 0,
        lastActive: p?.last_active_date ?? null,
        activeDays: activeDays.get(l.id) ?? 0,
        placedLevel: pl?.placed_level ?? null,
        placementSelfReported: pl ? pl.skipped : null,
      };
    }),
    attempts: attempts
      .filter((a) => lang.has(a.learner_id))
      .map((a) => ({
        language: lang.get(a.learner_id)!,
        exerciseType: a.exercise_type,
        outcome: a.outcome,
        firstAttempt: a.attempt_number === 1,
        revision: a.revision,
        supported: a.supported,
      })),
    lessonBytes: completions.filter((c) => c.data_bytes && lang.has(c.learner_id)).map((c) => ({ language: lang.get(c.learner_id)!, bytes: c.data_bytes! })),
    tutorByTier: tutor,
    today,
  });
}

export function metricsCsv(rows: MetricRow[]): string {
  const cell = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${["metric", "group", "value", "note"].join(",")}\n${rows.map((r) => [r.metric, r.group, r.value, r.note].map(cell).join(",")).join("\n")}\n`;
}

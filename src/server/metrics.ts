import "server-only";
import { addDays, diffDays } from "@/lib/learning/dates";
import type { AssessmentSection } from "@/lib/learning/types";
import { supabaseAdmin } from "./supabase";

/**
 * Anonymised pilot measures (docs/pilot-measurement-plan.md). Only aggregates
 * leave the database: no names, nicknames, pseudonyms or learner IDs, and any
 * figure that describes fewer than MIN_GROUP learners is suppressed, so no
 * individual can be singled out.
 */
export const MIN_GROUP = 5;
/** A retake counts as the post-assessment only this many days or more after the entry assessment. */
export const POST_MIN_DAYS = 14;
/** Length of the ranked lists (most failed exercises, exit points, unanswered questions). */
const TOP = 10;

type Lang = "zu" | "st";
type Group = "all" | Lang;
export type SectionScores = Partial<Record<AssessmentSection, { correct: number; total: number }>>;

/** In the order of the measures in the pilot plan: letter sounds, new-word decoding, sight words, sentences. */
const SECTIONS: AssessmentSection[] = ["letter_sounds", "transfer_decoding", "sight_words", "sentence_reading", "letter_recognition", "hl_decoding"];
const ONBOARDING_STEPS = ["welcome", "language", "hello", "demo", "profile", "save", "consent", "start-level", "assessment"];

export interface MetricRow {
  metric: string;
  group: Group;
  value: number | string;
  note?: string;
}

export interface LearnerFacts {
  language: Lang;
  /** Random pseudonym: links usage counts to the learner's language inside this computation. Never exported. */
  pseudonym: string;
  level: number;
  lessonsCompleted: number;
  /** Lesson completions, repeats included. */
  completions: number;
  objectivesMastered: number;
  longestStreak: number;
  lastActive: string | null;
  activeDays: number;
  /** Local dates with any learning activity, ascending, unique. */
  activityDates: string[];
  placedLevel: number | null;
  placementSelfReported: boolean | null;
  prePost: PrePost | null;
}

export interface PrePost {
  daysBetween: number;
  pre: SectionScores;
  post: SectionScores;
}

export interface AttemptFacts {
  language: Lang;
  /** Position of the learner in this computation only. Never exported. */
  learner: number;
  exerciseId: string;
  exerciseType: string;
  outcome: "correct" | "incorrect" | "practised";
  firstAttempt: boolean;
  revision: boolean;
  supported: boolean;
}

export interface AssessmentFacts {
  kind: string;
  instrument: string;
  skipped: boolean;
  scores: SectionScores;
  completedAt: string;
}

/** A usage event of a learner who agreed to usage counts (no others are stored). */
export interface EventFacts {
  pseudonym: string;
  event: string;
  props: Record<string, unknown>;
}

export interface UnansweredFacts {
  language: Lang;
  lessonId: string | null;
  exerciseId: string | null;
  intent: string | null;
}

const daysAgo = (today: string, n: number) => addDays(today, -n);

function suppress(count: number): number | string {
  return count > 0 && count < MIN_GROUP ? `<${MIN_GROUP}` : count;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const pct = (s: { correct: number; total: number }) => (s.correct / s.total) * 100;

/** Monday of the calendar week a date falls in. */
function weekOf(date: string): string {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/**
 * The entry assessment (the first one actually taken, not skipped) and the
 * latest retake on the same instrument at least POST_MIN_DAYS later.
 */
export function prePostPair(assessments: AssessmentFacts[]): PrePost | null {
  const taken = assessments.filter((a) => !a.skipped).sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const pre = taken[0];
  if (!pre) return null;
  const days = (a: AssessmentFacts) => diffDays(pre.completedAt.slice(0, 10), a.completedAt.slice(0, 10));
  const post = taken.filter((a) => (a.kind === "retake" || a.kind === "post") && a.instrument === pre.instrument && days(a) >= POST_MIN_DAYS).at(-1);
  return post ? { daysBetween: days(post), pre: pre.scores, post: post.scores } : null;
}

/** Ranked counts, most frequent first, ties in key order. */
function ranked<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const it of items) groups.set(key(it), [...(groups.get(key(it)) ?? []), it]);
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/** Pure aggregation, unit-tested without a database. */
export function aggregateMetrics(input: {
  learners: LearnerFacts[];
  attempts: AttemptFacts[];
  lessonBytes: { language: Lang; bytes: number }[];
  tutorByTier: { language: Lang; tier: number }[];
  unanswered: UnansweredFacts[];
  events: EventFacts[];
  today: string;
}): MetricRow[] {
  const rows: MetricRow[] = [];
  const languageOf = new Map(input.learners.map((l) => [l.pseudonym, l.language]));
  for (const group of ["all", "zu", "st"] as const) {
    const inGroup = (language: Lang) => group === "all" || language === group;
    const ls = input.learners.filter((l) => inGroup(l.language));
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

    // Learning outcomes: entry assessment against a later retake of the same instrument.
    const pairs = ls.map((l) => l.prePost).filter((p): p is PrePost => !!p);
    add("pre_post_pairs", suppress(pairs.length), `entry assessment and a retake of the same instrument at least ${POST_MIN_DAYS} days later`);
    if (pairs.length >= MIN_GROUP) {
      add("median_days_between_pre_and_post", median(pairs.map((p) => p.daysBetween)));
      for (const s of SECTIONS) {
        const both = pairs.filter((p) => p.pre[s]?.total && p.post[s]?.total);
        if (both.length < MIN_GROUP) continue;
        add(`pre_${s}_median_pct`, Math.round(median(both.map((p) => pct(p.pre[s]!)))), `${both.length} learners`);
        add(`post_${s}_median_pct`, Math.round(median(both.map((p) => pct(p.post[s]!)))), `${both.length} learners`);
        add(`change_${s}_median_points`, Math.round(median(both.map((p) => pct(p.post[s]!) - pct(p.pre[s]!)))), "percentage points, post minus pre");
        add(`improved_${s}`, suppress(both.filter((p) => pct(p.post[s]!) > pct(p.pre[s]!)).length), `of ${both.length} learners`);
      }
    }

    // Usability: first lesson (onboarding screens are counted below, from usage counts).
    add("completed_a_lesson", suppress(ls.filter((l) => l.completions > 0).length));

    // Engagement and retention.
    add("active_last_7_days", suppress(ls.filter((l) => l.lastActive && l.lastActive >= daysAgo(input.today, 7)).length));
    add("active_last_30_days", suppress(ls.filter((l) => l.lastActive && l.lastActive >= daysAgo(input.today, 30)).length));
    for (const d of [7, 30]) {
      const started = ls.filter((l) => l.activityDates.length > 0 && l.activityDates[0] <= daysAgo(input.today, d));
      const back = started.filter((l) => l.activityDates.some((x) => x >= addDays(l.activityDates[0], d)));
      add(`started_${d}_or_more_days_ago`, suppress(started.length));
      add(`still_learning_after_day_${d}`, suppress(back.length), `learned on a day ${d} or more days after their first day`);
      if (started.length >= MIN_GROUP) add(`retention_day_${d}_pct`, Math.round((back.length / started.length) * 100));
    }
    const weekly = ls.filter((l) => l.activityDates.length > 0).map((l) => l.completions / new Set(l.activityDates.map(weekOf)).size);
    add("median_lessons_per_active_week", round1(median(weekly)), "lesson completions (repeats included) per calendar week with any learning");
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

    // Content quality: first-attempt accuracy (independent first tries in lessons) and the exercises failed most.
    const at = input.attempts.filter((a) => inGroup(a.language) && a.firstAttempt && a.outcome !== "practised");
    const independent = at.filter((a) => !a.revision && !a.supported);
    for (const t of [...new Set(at.map((a) => a.exerciseType))].sort()) {
      const of = independent.filter((a) => a.exerciseType === t);
      if (of.length >= MIN_GROUP * 4) add(`first_try_accuracy_${t}`, Math.round((of.filter((a) => a.outcome === "correct").length / of.length) * 100), "% correct, unsupported first tries in lessons");
    }
    const failed = ranked(independent, (a) => a.exerciseId)
      .map(([id, tries]) => ({ id, type: tries[0].exerciseType, tries: tries.length, wrong: tries.filter((a) => a.outcome === "incorrect").length, learners: new Set(tries.map((a) => a.learner)).size }))
      .filter((e) => e.learners >= MIN_GROUP && e.wrong > 0)
      .sort((a, b) => b.wrong / b.tries - a.wrong / a.tries || b.tries - a.tries || a.id.localeCompare(b.id))
      .slice(0, TOP);
    failed.forEach((e, i) =>
      add(`most_failed_exercise_${i + 1}`, `${e.id} (${e.type})`, `${Math.round((e.wrong / e.tries) * 100)}% wrong on the first try; ${e.tries} first tries by ${e.learners} learners`),
    );
    const rev = at.filter((a) => a.revision);
    add("revision_items_answered", rev.length);
    if (rev.length >= MIN_GROUP * 4) add("revision_accuracy", Math.round((rev.filter((a) => a.outcome === "correct").length / rev.length) * 100), "% correct");
    add("listen_and_repeat_practised", input.attempts.filter((a) => inGroup(a.language) && a.outcome === "practised").length, "practice is never scored");

    // Cost to the learner: mobile data per lesson.
    const bytes = input.lessonBytes.filter((b) => inGroup(b.language)).map((b) => b.bytes);
    if (bytes.length >= MIN_GROUP) {
      add("mean_kb_downloaded_per_lesson", Math.round(bytes.reduce((s, b) => s + b, 0) / bytes.length / 1024), "measured on the phone while the lesson was open");
      add("median_kb_downloaded_per_lesson", Math.round(median(bytes) / 1024), "measured on the phone while the lesson was open");
    }

    // Tutor use, and the spoken questions it had no validated answer for.
    const tutor = input.tutorByTier.filter((t) => inGroup(t.language));
    add("tutor_spoken_questions_tier2", tutor.filter((t) => t.tier === 2).length);
    add("tutor_generated_answers_tier3", tutor.filter((t) => t.tier === 3).length);
    const unanswered = input.unanswered.filter((u) => inGroup(u.language));
    add("tutor_unanswered_questions", unanswered.length, "spoken questions answered with 'I can't answer that yet' (text kept for content authors, without any learner identifier)");
    ranked(unanswered, (u) => `${u.exerciseId ?? u.lessonId ?? "unknown step"}: ${u.intent ?? "unclassified"}`)
      .slice(0, TOP)
      .forEach(([key, list], i) => add(`most_unanswered_${i + 1}`, key, `${list.length} questions`));

    // Usage counts (only learners who agreed to them): where learners stop, and which help they ask for.
    const ev = input.events.filter((e) => {
      const language = languageOf.get(e.pseudonym);
      return !!language && inGroup(language);
    });
    const counting = new Set(ev.map((e) => e.pseudonym)).size;
    add("learners_sharing_usage_counts", suppress(counting), "the usage figures below describe only these learners");
    if (counting < MIN_GROUP) continue;
    const reached = (pred: (e: EventFacts) => boolean) => suppress(new Set(ev.filter(pred).map((e) => e.pseudonym)).size);
    for (const step of ONBOARDING_STEPS) add(`onboarding_reached_${step}`, reached((e) => e.event === "onboarding_step" && e.props.step === step));
    add("onboarding_completed", reached((e) => e.event === "onboarding_complete"));
    const lessonIds = [...new Set(ev.filter((e) => e.event === "lesson_start").map((e) => String(e.props.lessonId)))].sort();
    for (const id of lessonIds) {
      const starters = new Set(ev.filter((e) => e.event === "lesson_start" && e.props.lessonId === id).map((e) => e.pseudonym));
      if (starters.size < MIN_GROUP) continue;
      const finishers = new Set(ev.filter((e) => e.event === "lesson_complete" && e.props.lessonId === id && starters.has(e.pseudonym)).map((e) => e.pseudonym));
      add(`lesson_finished_pct_${id}`, Math.round((finishers.size / starters.size) * 100), `of ${starters.size} learners who opened it`);
    }
    ranked(
      ev.filter((e) => e.event === "lesson_exit"),
      (e) => `${e.props.stepId ?? e.props.lessonId} (${e.props.stepType ?? "step"})`,
    )
      .slice(0, TOP)
      .forEach(([key, list], i) => add(`most_common_exit_${i + 1}`, key, `${list.length} exits by ${suppress(new Set(list.map((e) => e.pseudonym)).size)} learners`));
    ranked(
      ev.filter((e) => e.event === "tutor_help"),
      (e) => String(e.props.option),
    ).forEach(([option, list]) => add(`help_requests_${option}`, list.length, `tapped or asked by ${suppress(new Set(list.map((e) => e.pseudonym)).size)} learners`));
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

/**
 * The pilot measures for every learner, or only for active members of the
 * given classes (the pilot classes, which only learners who gave research
 * consent join; see docs/pilot-measurement-plan.md).
 */
export async function pilotMetrics(today: string, cohortIds: string[] = []): Promise<MetricRow[]> {
  const db = supabaseAdmin();
  const members = cohortIds.length
    ? new Set(
        (await all<{ learner_id: string }>((f, t) => db.from("cohort_memberships").select("learner_id").in("cohort_id", cohortIds).eq("status", "active").range(f, t))).map(
          (m) => m.learner_id,
        ),
      )
    : null;
  const [allLearners, progress, assessments, streakDays, attempts, completions, tutor, unanswered, events] = await Promise.all([
    all<{ id: string; pseudonym: string; teaching_language: Lang; current_level: number }>((f, t) =>
      db.from("learners").select("id, pseudonym, teaching_language, current_level").order("created_at").range(f, t),
    ),
    all<{ learner_id: string; lessons_completed: number; objectives_mastered: number; longest_streak: number; last_active_date: string | null; current_level: number }>((f, t) =>
      db.from("learner_progress").select("learner_id, lessons_completed, objectives_mastered, longest_streak, last_active_date, current_level").range(f, t),
    ),
    all<{ learner_id: string; kind: string; instrument: string; placed_level: number; skipped: boolean; scores: SectionScores; completed_at: string }>((f, t) =>
      db.from("assessment_results").select("learner_id, kind, instrument, placed_level, skipped, scores, completed_at").order("completed_at").range(f, t),
    ),
    all<{ learner_id: string }>((f, t) => db.from("streak_days").select("learner_id").eq("kind", "active").range(f, t)),
    all<{ learner_id: string; exercise_id: string; exercise_type: string; outcome: "correct" | "incorrect" | "practised"; attempt_number: number; revision: boolean; supported: boolean; local_date: string }>(
      (f, t) => db.from("learning_attempts").select("learner_id, exercise_id, exercise_type, outcome, attempt_number, revision, supported, local_date").range(f, t),
    ),
    all<{ learner_id: string; data_bytes: number | null; local_date: string }>((f, t) => db.from("lesson_completions").select("learner_id, data_bytes, local_date").range(f, t)),
    all<{ learner_id: string; language: Lang; tier: number }>((f, t) => db.from("tutor_logs").select("learner_id, language, tier").range(f, t)),
    all<{ language: Lang; lesson_id: string | null; exercise_id: string | null; classified_intent: string | null }>((f, t) =>
      db.from("tutor_unanswered_intents").select("language, lesson_id, exercise_id, classified_intent").range(f, t),
    ),
    all<{ pseudonym: string | null; event: string; props: Record<string, unknown> }>((f, t) =>
      db
        .from("analytics_events")
        .select("pseudonym, event, props")
        .in("event", ["onboarding_step", "onboarding_complete", "lesson_start", "lesson_complete", "lesson_exit", "tutor_help"])
        .not("pseudonym", "is", null)
        .range(f, t),
    ),
  ]);
  const learners = members ? allLearners.filter((l) => members.has(l.id)) : allLearners;
  const index = new Map(learners.map((l, i) => [l.id, i]));
  const lang = new Map(learners.map((l) => [l.id, l.teaching_language]));
  const prog = new Map(progress.map((p) => [p.learner_id, p]));
  const assessmentsOf = new Map<string, typeof assessments>();
  for (const a of assessments) assessmentsOf.set(a.learner_id, [...(assessmentsOf.get(a.learner_id) ?? []), a]);
  const activeDays = new Map<string, number>();
  for (const s of streakDays) activeDays.set(s.learner_id, (activeDays.get(s.learner_id) ?? 0) + 1);
  const dates = new Map<string, Set<string>>();
  const completionCount = new Map<string, number>();
  for (const r of [...attempts, ...completions]) dates.set(r.learner_id, (dates.get(r.learner_id) ?? new Set()).add(r.local_date));
  for (const c of completions) completionCount.set(c.learner_id, (completionCount.get(c.learner_id) ?? 0) + 1);

  return aggregateMetrics({
    learners: learners.map((l) => {
      const p = prog.get(l.id);
      const own = assessmentsOf.get(l.id) ?? [];
      const placement = own.find((a) => a.kind === "placement");
      return {
        language: l.teaching_language,
        pseudonym: l.pseudonym,
        level: p?.current_level ?? l.current_level,
        lessonsCompleted: p?.lessons_completed ?? 0,
        completions: completionCount.get(l.id) ?? 0,
        objectivesMastered: p?.objectives_mastered ?? 0,
        longestStreak: p?.longest_streak ?? 0,
        lastActive: p?.last_active_date ?? null,
        activeDays: activeDays.get(l.id) ?? 0,
        activityDates: [...(dates.get(l.id) ?? [])].sort(),
        placedLevel: placement?.placed_level ?? null,
        placementSelfReported: placement ? placement.skipped : null,
        prePost: prePostPair(own.map((a) => ({ kind: a.kind, instrument: a.instrument, skipped: a.skipped, scores: a.scores, completedAt: a.completed_at }))),
      };
    }),
    attempts: attempts
      .filter((a) => lang.has(a.learner_id))
      .map((a) => ({
        language: lang.get(a.learner_id)!,
        learner: index.get(a.learner_id)!,
        exerciseId: a.exercise_id,
        exerciseType: a.exercise_type,
        outcome: a.outcome,
        firstAttempt: a.attempt_number === 1,
        revision: a.revision,
        supported: a.supported,
      })),
    lessonBytes: completions.filter((c) => c.data_bytes && lang.has(c.learner_id)).map((c) => ({ language: lang.get(c.learner_id)!, bytes: c.data_bytes! })),
    tutorByTier: tutor.filter((t) => lang.has(t.learner_id)),
    // Unanswered questions carry no learner identifier, so they cannot be limited to the chosen classes.
    unanswered: unanswered.map((u) => ({ language: u.language, lessonId: u.lesson_id, exerciseId: u.exercise_id, intent: u.classified_intent })),
    events: events.filter((e): e is typeof e & { pseudonym: string } => !!e.pseudonym).map((e) => ({ pseudonym: e.pseudonym, event: e.event, props: e.props ?? {} })),
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

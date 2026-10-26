import { maxDate } from "./dates";
import { ObjectiveTracker } from "./mastery";
import { applyAttemptToCard } from "./revision";
import { computeStreak, isActiveDay, type DayActivity } from "./streak";
import { XP_RULES } from "./xp";
import type {
  BadgeState,
  CurriculumMeta,
  DerivedState,
  LessonState,
  LevelState,
  ObjectiveState,
  Op,
  RevisionCard,
} from "./types";

/**
 * Deterministic order for an activity log: client timestamp, then op ID.
 * Duplicate IDs (the same op delivered twice) are dropped, keeping the first.
 */
export function normaliseOps(ops: readonly Op[]): Op[] {
  const seen = new Set<string>();
  const unique: Op[] = [];
  for (const op of ops) {
    if (seen.has(op.id)) continue;
    seen.add(op.id);
    unique.push(op);
  }
  return unique.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Derive all progress (mastery, XP, streak, revision schedule, badges, level)
 * from an activity log. Pure: the phone and the server call this with the
 * same log and get the same answer. `today` is the local calendar date used
 * to decide whether the streak is still alive.
 */
export function deriveState(opsIn: readonly Op[], meta: CurriculumMeta, today: string): DerivedState {
  const ops = normaliseOps(opsIn);
  const trackers = new Map<string, ObjectiveTracker>();
  const lessons: Record<string, LessonState> = {};
  const completionDates = new Map<string, Set<string>>();
  const revision: Record<string, RevisionCard> = {};
  const activity = new Map<string, DayActivity>();
  const xp = { answers: 0, practice: 0, lessons: 0, mastery: 0 };
  let level: LevelState = { current: 0, source: "default" };
  const assessments: DerivedState["assessments"] = [];
  let lastLesson: DerivedState["lastLesson"];
  let attemptCount = 0;
  let lastActiveDate: string | undefined;

  const trackerFor = (objectiveId: string): ObjectiveTracker | undefined => {
    const def = meta.objectives[objectiveId];
    if (!def) return undefined;
    let t = trackers.get(objectiveId);
    if (!t) {
      t = new ObjectiveTracker(def.masteryCompetencies);
      trackers.set(objectiveId, t);
    }
    return t;
  };

  const touchDay = (date: string, at: string, kind: "lesson" | "attempt") => {
    const day = activity.get(date) ?? { lessons: 0, attempts: 0 };
    const wasActive = isActiveDay(day);
    if (kind === "lesson") day.lessons += 1;
    else day.attempts += 1;
    if (!wasActive && isActiveDay(day)) day.activeAt = at;
    activity.set(date, day);
  };

  for (const op of ops) {
    switch (op.type) {
      case "attempt": {
        const a = op.data;
        attemptCount += 1;
        lastActiveDate = maxDate(lastActiveDate, op.localDate);
        touchDay(op.localDate, op.at, "attempt");

        if (a.outcome === "practised") xp.practice += XP_RULES.PRACTISED;
        else if (a.outcome === "correct")
          xp.answers += a.attemptNumber === 1 ? XP_RULES.CORRECT_FIRST_TRY : XP_RULES.CORRECT_RETRY;

        for (const objectiveId of a.objectiveIds) {
          const tracker = trackerFor(objectiveId);
          if (!tracker) continue;
          if (a.outcome === "practised") {
            if (a.evidence.some((e) => e.competency === "repeat")) tracker.addPractice(op.at);
            continue;
          }
          if (a.attemptNumber !== 1) continue;
          for (const e of a.evidence) {
            if (e.competency === "repeat") continue;
            if (a.supported && (e.competency === "decode" || e.competency === "understand_written")) continue;
            tracker.addEvidence(e.competency, {
              at: op.at,
              itemId: a.itemId,
              correct: a.outcome === "correct",
              weight: e.weight,
            });
          }
        }

        const card = applyAttemptToCard(revision[a.exerciseId], a, op.at, op.localDate);
        if (card) revision[a.exerciseId] = card;
        break;
      }
      case "lesson_complete": {
        const d = op.data;
        lastActiveDate = maxDate(lastActiveDate, op.localDate);
        touchDay(op.localDate, op.at, "lesson");
        const ls = lessons[d.lessonId] ?? { completions: 0 };
        const dates = completionDates.get(d.lessonId) ?? new Set<string>();
        if (ls.completions === 0) xp.lessons += XP_RULES.LESSON_FIRST_COMPLETION;
        else if (!dates.has(op.localDate)) xp.lessons += XP_RULES.LESSON_REPEAT_COMPLETION;
        dates.add(op.localDate);
        completionDates.set(d.lessonId, dates);
        lessons[d.lessonId] = {
          completions: ls.completions + 1,
          firstCompletedAt: ls.firstCompletedAt ?? op.at,
          lastCompletedAt: op.at,
          bestCorrect: Math.max(ls.bestCorrect ?? 0, d.correct),
          total: d.total,
        };
        break;
      }
      case "lesson_progress":
        lastLesson = { lessonId: op.data.lessonId, stepIndex: op.data.stepIndex, at: op.at };
        break;
      case "assessment":
        assessments.push({ opId: op.id, at: op.at, data: op.data });
        level = { current: op.data.placedLevel, placedLevel: op.data.placedLevel, source: "placement" };
        break;
      case "level_change":
        level = { current: op.data.level, placedLevel: level.placedLevel, source: "manual" };
        break;
    }
  }

  const objectives: Record<string, ObjectiveState> = {};
  for (const [id, tracker] of trackers) {
    const state = tracker.state();
    objectives[id] = state;
    if (state.firstMasteredAt) xp.mastery += XP_RULES.OBJECTIVE_MASTERED;
  }

  const streakResult = computeStreak(activity, today);
  const { reachedAt, ...streak } = streakResult;

  const badges: Record<string, BadgeState> = {};
  const completedInOrder = Object.entries(lessons)
    .filter(([, l]) => l.firstCompletedAt)
    .map(([, l]) => l.firstCompletedAt as string)
    .sort();
  for (const badge of meta.badges) {
    const c = badge.criterion;
    let earnedAt: string | undefined;
    switch (c.kind) {
      case "objective_mastered":
        earnedAt = objectives[c.objective]?.firstMasteredAt;
        break;
      case "objectives_mastered": {
        const dates = c.objectives.map((o) => objectives[o]?.firstMasteredAt);
        if (dates.every((d): d is string => !!d)) earnedAt = dates.sort()[dates.length - 1];
        break;
      }
      case "lesson_completed":
        earnedAt = lessons[c.lesson]?.firstCompletedAt;
        break;
      case "lessons_completed":
        earnedAt = completedInOrder[c.count - 1];
        break;
      case "streak":
        earnedAt = reachedAt[c.days];
        break;
    }
    if (earnedAt) badges[badge.id] = { earnedAt };
  }

  return {
    xp: xp.answers + xp.practice + xp.lessons + xp.mastery,
    xpBreakdown: xp,
    lessons,
    objectives,
    streak,
    revision,
    badges,
    level,
    assessments,
    lastLesson,
    attemptCount,
    lastActiveDate,
  };
}

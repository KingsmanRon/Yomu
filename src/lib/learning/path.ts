import type { CurriculumMeta, DerivedState } from "./types";

/**
 * Learning path rules (documented in docs/learning-engine.md).
 *
 * Lessons are ordered by educational prerequisites (level, unit, order).
 * A lesson is open when it is at or below the learner's level, or when the
 * lesson before it has been completed. Completing a lesson always opens the
 * next one, however many mistakes were made: mistakes go to revision, they
 * never block. Learners and facilitators can change the level at any time.
 */
export type LessonAvailability = "completed" | "open" | "locked";

export function orderedLessonIds(meta: CurriculumMeta, unitOrder: Record<string, number>): string[] {
  return Object.entries(meta.lessons)
    .sort(([, a], [, b]) => a.level - b.level || (unitOrder[a.unit] ?? 0) - (unitOrder[b.unit] ?? 0) || a.order - b.order)
    .map(([id]) => id);
}

/** The learner's working level: their chosen level, or higher if they completed lessons beyond it. */
export function effectiveLevel(state: DerivedState, meta: CurriculumMeta): number {
  let level = state.level.current;
  for (const [id, l] of Object.entries(state.lessons)) {
    if (l.completions > 0 && meta.lessons[id]) level = Math.max(level, meta.lessons[id].level);
  }
  return level;
}

export function lessonAvailability(
  meta: CurriculumMeta,
  state: DerivedState,
  order: string[],
): Record<string, LessonAvailability> {
  const level = state.level.current;
  const result: Record<string, LessonAvailability> = {};
  order.forEach((id, i) => {
    if ((state.lessons[id]?.completions ?? 0) > 0) result[id] = "completed";
    else if (meta.lessons[id].level <= level) result[id] = "open";
    else if (i > 0 && (state.lessons[order[i - 1]]?.completions ?? 0) > 0) result[id] = "open";
    else result[id] = "locked";
  });
  return result;
}

/**
 * The lesson to suggest next: an unfinished lesson started earlier, otherwise
 * the first open, not-yet-completed lesson at or above the learner's level,
 * otherwise any open lesson not yet completed.
 */
export function recommendedLesson(
  meta: CurriculumMeta,
  state: DerivedState,
  order: string[],
): { lessonId: string; resumeStep: number } | null {
  const availability = lessonAvailability(meta, state, order);
  const last = state.lastLesson;
  if (last && meta.lessons[last.lessonId]) {
    const done = state.lessons[last.lessonId]?.lastCompletedAt;
    if (!done || done < last.at) return { lessonId: last.lessonId, resumeStep: last.stepIndex };
  }
  const level = state.level.current;
  const atLevel = order.find((id) => availability[id] === "open" && meta.lessons[id].level >= level);
  if (atLevel) return { lessonId: atLevel, resumeStep: 0 };
  const any = order.find((id) => availability[id] === "open");
  return any ? { lessonId: any, resumeStep: 0 } : null;
}

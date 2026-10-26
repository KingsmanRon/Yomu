/**
 * XP rules (documented in docs/learning-engine.md).
 *
 * XP is recalculated from the full activity log every time, never summed
 * from stored totals, so merging logs from several devices or replaying a
 * sync can never double-count. XP is personal motivation only: it never
 * unlocks or blocks learning, and there is no public ranking.
 */
export const XP_RULES = {
  CORRECT_FIRST_TRY: 2,
  CORRECT_RETRY: 1,
  PRACTISED: 1,
  LESSON_FIRST_COMPLETION: 10,
  /** Repeating a lesson on a new day, at most once per lesson per day. */
  LESSON_REPEAT_COMPLETION: 5,
  OBJECTIVE_MASTERED: 20,
} as const;

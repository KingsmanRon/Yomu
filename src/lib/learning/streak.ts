import { addDays } from "./dates";
import type { StreakState } from "./types";

/**
 * Forgiving streak rules (documented in docs/learning-engine.md).
 *
 *  - A local calendar day is "active" when the learner completes at least one
 *    lesson, or answers at least MIN_ATTEMPTS exercises (for example a short
 *    revision session). Offline activity counts on the device's local date
 *    once it is synced.
 *  - Learners start with INITIAL_GRACE grace days and earn one more for every
 *    GRACE_EVERY active days, holding at most MAX_GRACE.
 *  - A missed day is covered automatically by a grace day when one is
 *    available. Only when none is left does the streak start again.
 *  - Today never breaks a streak: the day is not over yet.
 *
 * Losing a streak never blocks anything in the app.
 */
export const STREAK_RULES = {
  MIN_ATTEMPTS: 5,
  INITIAL_GRACE: 2,
  GRACE_EVERY: 7,
  MAX_GRACE: 3,
} as const;

export interface DayActivity {
  lessons: number;
  attempts: number;
  /** Timestamp of the op that made this day count as active. */
  activeAt?: string;
}

export function isActiveDay(a: DayActivity | undefined): boolean {
  return !!a && (a.lessons >= 1 || a.attempts >= STREAK_RULES.MIN_ATTEMPTS);
}

export interface StreakResult extends StreakState {
  /** For each streak length reached, the timestamp of the op that reached it first. */
  reachedAt: Record<number, string>;
}

export function computeStreak(activity: Map<string, DayActivity>, today: string): StreakResult {
  const activeDates = [...activity.entries()]
    .filter(([, a]) => isActiveDay(a))
    .map(([d]) => d)
    .sort();
  const result: StreakResult = {
    current: 0,
    longest: 0,
    graceRemaining: STREAK_RULES.INITIAL_GRACE,
    activeDates,
    graceDates: [],
    todayActive: isActiveDay(activity.get(today)),
    reachedAt: {},
  };
  if (activeDates.length === 0) return result;

  const lastDay = activeDates[activeDates.length - 1] > today ? activeDates[activeDates.length - 1] : today;
  let grace: number = STREAK_RULES.INITIAL_GRACE;
  let current = 0;
  let longest = 0;
  let activeCount = 0;

  for (let d = activeDates[0]; d <= lastDay; d = addDays(d, 1)) {
    const a = activity.get(d);
    if (isActiveDay(a)) {
      current += 1;
      activeCount += 1;
      if (activeCount % STREAK_RULES.GRACE_EVERY === 0) grace = Math.min(STREAK_RULES.MAX_GRACE, grace + 1);
      if (current > longest) longest = current;
      if (result.reachedAt[current] === undefined && a?.activeAt) result.reachedAt[current] = a.activeAt;
    } else if (d === today) {
      // The day is not over yet.
    } else if (current > 0 && grace > 0) {
      grace -= 1;
      result.graceDates.push(d);
    } else {
      current = 0;
    }
  }

  result.current = current;
  result.longest = longest;
  result.graceRemaining = grace;
  return result;
}

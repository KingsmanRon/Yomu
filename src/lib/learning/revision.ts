import { addDays, diffDays } from "./dates";
import type { AttemptData, ObjectiveState, RevisionCard } from "./types";

/**
 * Spaced revision: a Leitner system (documented in docs/learning-engine.md).
 *
 * Every exercise that has a right answer becomes a card the first time the
 * learner attempts it. Cards live in boxes 1-5; each box has a review
 * interval. A wrong first attempt sends the card to box 1, due the same day,
 * so missed exercises can be revised straight away. A correct first attempt
 * moves it up one box. Correct answers given with help (the target was
 * revealed first) do not move a card up.
 */
export const LEITNER_INTERVAL_DAYS: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
export const MAX_BOX = 5;

export function applyAttemptToCard(
  card: RevisionCard | undefined,
  attempt: AttemptData,
  at: string,
  localDate: string,
): RevisionCard | undefined {
  if (attempt.outcome === "practised") return card;
  if (attempt.attemptNumber > 1) {
    // Retries after feedback do not move cards; the first attempt already did.
    return card ? { ...card, lastAttemptAt: at } : card;
  }
  const failedDecode =
    attempt.outcome === "incorrect" && attempt.evidence.some((e) => e.competency === "decode" && e.weight >= 1);

  const base: RevisionCard = card ?? {
    exerciseId: attempt.exerciseId,
    lessonId: attempt.lessonId,
    itemId: attempt.itemId,
    objectiveIds: attempt.objectiveIds,
    box: 1,
    dueDate: localDate,
    lastOutcome: attempt.outcome,
    lastAttemptAt: at,
    lapses: 0,
  };

  if (attempt.outcome === "incorrect") {
    return {
      ...base,
      box: 1,
      dueDate: addDays(localDate, LEITNER_INTERVAL_DAYS[1]),
      lastOutcome: "incorrect",
      lastAttemptAt: at,
      lapses: base.lapses + (card ? 1 : 0),
      lastFailedDecodeDate: failedDecode ? localDate : base.lastFailedDecodeDate,
    };
  }

  if (attempt.supported) {
    return { ...base, lastOutcome: "correct", lastAttemptAt: at, dueDate: card ? base.dueDate : addDays(localDate, 1) };
  }

  const box = card ? Math.min(MAX_BOX, card.box + 1) : 2;
  return {
    ...base,
    box,
    dueDate: addDays(localDate, LEITNER_INTERVAL_DAYS[box]),
    lastOutcome: "correct",
    lastAttemptAt: at,
  };
}

/**
 * Priority of a due card. Higher comes first. Failed independent decoding
 * weighs most, then fresh mistakes, then how overdue the card is.
 */
export function revisionPriority(
  card: RevisionCard,
  today: string,
  objectives: Record<string, ObjectiveState>,
): number {
  const overdue = Math.max(0, diffDays(card.dueDate, today));
  const failedDecode = card.lastFailedDecodeDate ? 4 : 0;
  const freshMistake = card.box === 1 ? 3 : 0;
  const notMastered = card.objectiveIds.some((o) => objectives[o]?.status !== "mastered") ? 1 : 0;
  return overdue + failedDecode + freshMistake + notMastered + card.lapses * 0.5;
}

export function dueCards(
  cards: Record<string, RevisionCard>,
  today: string,
  objectives: Record<string, ObjectiveState>,
  limit = 8,
): RevisionCard[] {
  return Object.values(cards)
    .filter((c) => c.dueDate <= today)
    .sort((a, b) => {
      const diff = revisionPriority(b, today, objectives) - revisionPriority(a, today, objectives);
      if (diff !== 0) return diff;
      return a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0;
    })
    .slice(0, limit);
}

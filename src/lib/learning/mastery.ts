import type { Competency, CompetencyState, ObjectiveState, ObjectiveStatus } from "./types";

/**
 * Mastery rules (documented in docs/learning-engine.md).
 *
 * For each objective and competency we keep the chronological list of
 * evidence events. Only first attempts count (a retry after feedback is
 * supported by that feedback). For `decode` and `understand_written`, an
 * attempt where the target was played or revealed first is excluded.
 *
 * A competency is satisfied when, over the last WINDOW events:
 *   - weighted correct >= MIN_WEIGHTED_CORRECT, and
 *   - weighted accuracy >= MIN_ACCURACY, and
 *   - correct answers cover at least min(MIN_DISTINCT_ITEMS, items seen) different items, and
 *   - for `decode` only: at least MIN_FULL_DECODE_CORRECT correct full-weight
 *     (independent reading) events. Half-weight evidence such as building a
 *     word from tiles after hearing it can never reach decoding mastery alone.
 *
 * `repeat` (listen-and-repeat self-checks) is never mastered; it is reported
 * as "practised".
 */
export const MASTERY_RULES = {
  WINDOW: 5,
  MIN_WEIGHTED_CORRECT: 3,
  MIN_ACCURACY: 0.75,
  MIN_DISTINCT_ITEMS: 2,
  MIN_FULL_DECODE_CORRECT: 2,
} as const;

export interface EvidenceEvent {
  at: string;
  itemId: string;
  correct: boolean;
  weight: number;
}

export function windowSatisfied(competency: Competency, events: EvidenceEvent[], allItems: Set<string>): boolean {
  if (competency === "repeat") return false;
  const window = events.slice(-MASTERY_RULES.WINDOW);
  if (window.length === 0) return false;
  let weightedCorrect = 0;
  let weightedTotal = 0;
  let fullDecodeCorrect = 0;
  const correctItems = new Set<string>();
  for (const e of window) {
    weightedTotal += e.weight;
    if (e.correct) {
      weightedCorrect += e.weight;
      correctItems.add(e.itemId);
      if (e.weight >= 1) fullDecodeCorrect += 1;
    }
  }
  if (weightedCorrect < MASTERY_RULES.MIN_WEIGHTED_CORRECT) return false;
  if (weightedTotal === 0 || weightedCorrect / weightedTotal < MASTERY_RULES.MIN_ACCURACY) return false;
  if (correctItems.size < Math.min(MASTERY_RULES.MIN_DISTINCT_ITEMS, allItems.size)) return false;
  if (competency === "decode" && fullDecodeCorrect < MASTERY_RULES.MIN_FULL_DECODE_CORRECT) return false;
  return true;
}

/** Incrementally tracks one objective's evidence in chronological order. */
export class ObjectiveTracker {
  private events = new Map<Competency, EvidenceEvent[]>();
  private items = new Map<Competency, Set<string>>();
  private practised = 0;
  private lastPractisedAt?: string;
  private firstMastered = new Map<Competency, string>();
  private objectiveFirstMasteredAt?: string;

  constructor(private readonly required: Competency[]) {}

  addPractice(at: string): void {
    this.practised += 1;
    this.lastPractisedAt = at;
  }

  addEvidence(competency: Competency, event: EvidenceEvent): void {
    const list = this.events.get(competency) ?? [];
    list.push(event);
    this.events.set(competency, list);
    const items = this.items.get(competency) ?? new Set<string>();
    items.add(event.itemId);
    this.items.set(competency, items);

    if (!this.firstMastered.has(competency) && windowSatisfied(competency, list, items)) {
      this.firstMastered.set(competency, event.at);
    }
    if (!this.objectiveFirstMasteredAt && this.allRequiredSatisfiedNow()) {
      this.objectiveFirstMasteredAt = event.at;
    }
  }

  private satisfiedNow(competency: Competency): boolean {
    return windowSatisfied(competency, this.events.get(competency) ?? [], this.items.get(competency) ?? new Set());
  }

  private allRequiredSatisfiedNow(): boolean {
    return this.required.length > 0 && this.required.every((c) => this.satisfiedNow(c));
  }

  competencyState(competency: Competency): CompetencyState {
    if (competency === "repeat") {
      return this.practised > 0
        ? { status: "practised", events: this.practised, correct: 0, lastEvidenceAt: this.lastPractisedAt }
        : { status: "not_started", events: 0, correct: 0 };
    }
    const list = this.events.get(competency) ?? [];
    if (list.length === 0) return { status: "not_started", events: 0, correct: 0 };
    const satisfied = this.satisfiedNow(competency);
    const first = this.firstMastered.get(competency);
    return {
      status: satisfied ? "mastered" : first ? "needs_review" : "developing",
      events: list.length,
      correct: list.filter((e) => e.correct).length,
      firstMasteredAt: first,
      lastEvidenceAt: list[list.length - 1].at,
    };
  }

  state(): ObjectiveState {
    const competencies: Partial<Record<Competency, CompetencyState>> = {};
    const seen = new Set<Competency>([...this.required, ...this.events.keys()]);
    if (this.practised > 0) seen.add("repeat");
    for (const c of seen) competencies[c] = this.competencyState(c);

    let status: ObjectiveStatus;
    if (this.allRequiredSatisfiedNow()) status = "mastered";
    else if (this.objectiveFirstMasteredAt) status = "needs_review";
    else if ([...this.events.values()].some((l) => l.length > 0)) status = "developing";
    else if (this.practised > 0) status = "practised";
    else status = "not_started";

    return { status, firstMasteredAt: this.objectiveFirstMasteredAt, competencies };
  }
}

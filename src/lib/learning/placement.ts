import type { AssessmentData, AssessmentSection } from "./types";

/**
 * Placement from the initial assessment (documented in docs/learning-engine.md).
 *
 * A section is "secure" at 2 out of 3 (two thirds) or better. The learner
 * starts at the first level whose entry skills are not yet secure:
 *
 *   home-language decoding AND letter sounds not secure  -> Level 0 (home-language bridge)
 *   letter names or letter sounds not secure              -> Level 1
 *   sight words not secure, or new-word decoding < half   -> Level 2
 *   any sentence not read                                 -> Level 3
 *   otherwise                                             -> Level 4
 *
 * The result is a starting suggestion, never a judgement: learners can change
 * level or retake the assessment at any time.
 */
export const SECURE_RATIO = 2 / 3;

function ratio(scores: AssessmentData["scores"], section: AssessmentSection): number | undefined {
  const s = scores[section];
  if (!s || s.total === 0) return undefined;
  return s.correct / s.total;
}

export function placementLevel(scores: AssessmentData["scores"]): number {
  const secure = (section: AssessmentSection, threshold = SECURE_RATIO) => {
    const r = ratio(scores, section);
    return r === undefined ? false : r >= threshold - 1e-9;
  };
  if (!secure("hl_decoding") && !secure("letter_sounds")) return 0;
  if (!secure("letter_recognition") || !secure("letter_sounds")) return 1;
  if (!secure("sight_words") || !secure("transfer_decoding", 0.5)) return 2;
  if (!secure("sentence_reading", 1)) return 3;
  return 4;
}

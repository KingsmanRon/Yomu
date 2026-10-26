import type { ErrorType } from "@/lib/learning/types";

/**
 * Default feedback clip for each error type. A lesson can override any of
 * them per exercise (`feedback` in the lesson file). The content validator
 * checks that every error type an exercise can produce resolves to a clip
 * that exists in both teaching languages.
 */
export const DEFAULT_FEEDBACK: Record<ErrorType, string> = {
  wrong_choice: "fb.wrong_choice",
  first_sound: "fb.first_sound",
  middle_sound: "fb.middle_sound",
  last_sound: "fb.last_sound",
  letter_shape: "fb.letter_shape",
  meaning: "fb.meaning",
  order: "fb.order",
  missing_letter: "fb.missing_letter",
  trace_off_path: "fb.trace_off_path",
  typing_mismatch: "fb.typing_mismatch",
  same_different: "fb.same_different",
  detail: "fb.detail",
};

/** Clips used by the lesson player around every exercise. */
export const CORE_CLIPS = {
  correct: ["fb.correct.1", "fb.correct.2", "fb.correct.3"],
  correctReading: "fb.correct.read",
  tryAgain: "fb.try_again",
  showAnswer: "fb.show_answer",
  mistakesOk: "fb.mistakes_ok",
} as const;

import type { CompiledExercise, CompiledLex, Lang } from "@/lib/content/compiled";
import type { ErrorType } from "@/lib/learning/types";

export type ExercisePhase = "answering" | "correct" | "retry" | "revealed";

export interface AnswerResult {
  correct: boolean;
  errorType?: ErrorType;
  /** Lexicon ID of the item answered (defaults to the exercise target). */
  itemId?: string;
}

export interface ExerciseProps<E extends CompiledExercise = CompiledExercise> {
  ex: E;
  lex: Record<string, CompiledLex>;
  lang: Lang;
  phase: ExercisePhase;
  onAnswer: (r: AnswerResult) => void;
  /** Register what the persistent "listen again" control replays for this exercise. */
  setReplay: (fn: () => void) => void;
}

export interface PracticeProps {
  /** Listen-and-repeat reports each item as practised (never scored). */
  onPractised: (itemId: string, selfCheck: "same" | "different" | "no_recording") => void;
  onDone: () => void;
}

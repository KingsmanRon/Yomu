import type { CompiledExercise, CompiledLex, CompiledStep } from "@/lib/content/compiled";
import { isIndependentReadingTask, type ExerciseKind } from "@/lib/learning/evidence";

/**
 * Tier 1 tutor: chooses which validated, recorded clips to play for a help
 * request, from the current step and exercise. Works fully offline. Only
 * clips from the validated library and the lesson's own recorded lines are
 * ever played.
 *
 * Honesty rule: in a task that measures independent reading, any help that
 * reveals the target (its sound or its meaning) marks the attempt as
 * "supported", so it cannot count as reading on one's own. The tutor says so
 * before revealing (clip tutor.read_alone_first).
 */
export type HelpId = "replay" | "how" | "slow" | "hear" | "letter" | "meaning" | "ask";

export interface HelpOption {
  id: HelpId;
  /** Revealing this would turn the current attempt into a supported one. */
  reveals: boolean;
}

/** One thing to play: a clip, a lesson line, or a lexicon entry's audio. */
export type HelpItem =
  | { kind: "clip"; clipId: string }
  | { kind: "line"; which: "instruction" | "teach" | "intro" }
  | { kind: "lex"; lexId: string; part: "audio" | "gloss" | "firstSound"; rate?: number };

export function exerciseKindOf(ex: CompiledExercise): ExerciseKind {
  return ("mode" in ex ? { type: ex.type, mode: ex.mode } : { type: ex.type }) as ExerciseKind;
}

/** The lexicon entry an exercise is about, if any. */
export function targetLexId(ex: CompiledExercise): string | undefined {
  switch (ex.type) {
    case "letter_sound":
    case "picture_match":
    case "word_build":
    case "sentence_build":
    case "typing":
      return ex.target;
    case "minimal_pair":
      return ex.target ?? ex.pair[0];
    case "trace":
      return ex.letter;
    case "listen_repeat":
      return ex.items[0];
    case "listening_comprehension":
      return ex.audio;
    case "reading_comprehension":
      return ex.passage;
    case "real_world":
      return undefined;
  }
}

/** Exercises where hearing the target is part of the task (no reading claim). */
export function targetIsHeard(ex: CompiledExercise): boolean {
  switch (ex.type) {
    case "listen_repeat":
    case "listening_comprehension":
    case "minimal_pair":
    case "sentence_build":
      return true;
    case "letter_sound":
      return ex.mode !== "letter_to_sound";
    case "picture_match":
      return ex.mode === "listen";
    case "word_build":
      return ex.mode === "listen";
    case "typing":
      return ex.mode === "listen";
    default:
      return false;
  }
}

export function helpOptions(
  step: CompiledStep,
  lex: Record<string, CompiledLex>,
  opts: { spokenQuestions: boolean },
): HelpOption[] {
  const out: HelpOption[] = [{ id: "replay", reveals: false }];
  if (step.kind === "teach") return out;
  const ex = step;
  out.push({ id: "how", reveals: false });
  const lexId = targetLexId(ex);
  const target = lexId ? lex[lexId] : undefined;
  const reading = isIndependentReadingTask(exerciseKindOf(ex));
  if (target?.audio) {
    if (targetIsHeard(ex)) out.push({ id: "slow", reveals: false });
    else out.push({ id: "hear", reveals: reading });
  }
  if (target && (target.kind === "letter" || (target.graphemeAudio?.[0] ?? null))) out.push({ id: "letter", reveals: reading });
  if (target?.gloss)
    out.push({ id: "meaning", reveals: reading || ex.evidence.some((e) => e.competency === "understand_spoken") });
  if (opts.spokenQuestions) out.push({ id: "ask", reveals: false });
  return out;
}

/** What to play for a help option. `confirmedReveal` is false on the first tap of a revealing option. */
export function helpSequence(id: HelpId, step: CompiledStep, confirmedReveal: boolean, reveals: boolean): HelpItem[] {
  if (reveals && !confirmedReveal) return [{ kind: "clip", clipId: "tutor.read_alone_first" }];
  if (step.kind === "teach") {
    return [{ kind: "clip", clipId: "tutor.replay_intro" }, { kind: "line", which: "teach" }];
  }
  const lexId = targetLexId(step);
  switch (id) {
    case "replay":
      return [{ kind: "clip", clipId: "tutor.replay_intro" }, { kind: "line", which: "instruction" }];
    case "how":
      return [{ kind: "clip", clipId: "tutor.how_it_works" }, { kind: "line", which: "instruction" }];
    case "slow":
      return lexId ? [{ kind: "clip", clipId: "tutor.listen_slow" }, { kind: "lex", lexId, part: "audio", rate: 0.7 }] : [];
    case "hear":
      return lexId ? [{ kind: "lex", lexId, part: "audio" }] : [];
    case "letter":
      return lexId ? [{ kind: "clip", clipId: "tutor.sound_of_letter" }, { kind: "lex", lexId, part: "firstSound" }] : [];
    case "meaning":
      return lexId ? [{ kind: "clip", clipId: "tutor.word_meaning" }, { kind: "lex", lexId, part: "gloss" }] : [];
    case "ask":
      return [{ kind: "clip", clipId: "tutor.ask_prompt" }];
  }
}

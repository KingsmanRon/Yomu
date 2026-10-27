import type { EvidenceWeight, ErrorType } from "./types";

/**
 * What each lesson component's results are evidence for.
 *
 * This table is the declaration required by the curriculum design: the
 * mastery engine only ever counts a result towards the competencies listed
 * here. The rules that matter most:
 *
 *  - Listen-and-repeat is evidence of `repeat` only, and only ever recorded as
 *    "practised". Saying a word after a model is never reading.
 *  - Hearing a sound or word and choosing it (`sound_to_letter`, `which_word`,
 *    `hear_in_word`) is recognition, not decoding.
 *  - Full-weight `decode` evidence comes only from tasks where the learner sees
 *    written text with no audio of the target and must work out what it says
 *    (choose the picture, choose the sound, answer a question about it).
 *  - Building a word or sentence from tiles after hearing it is encoding. It
 *    contributes half-weight decoding evidence, so it can support but never
 *    produce decoding mastery on its own (see mastery.ts).
 */
export type ExerciseKind =
  | { type: "listen_repeat" }
  | { type: "letter_sound"; mode: "sound_to_letter" | "letter_to_sound" | "hear_in_word" }
  | { type: "picture_match"; mode: "read" | "listen" | "name" }
  | { type: "word_build"; mode: "listen" | "picture" }
  | { type: "listening_comprehension" }
  | { type: "sentence_build" }
  | { type: "reading_comprehension" }
  | { type: "trace" }
  | { type: "minimal_pair"; mode: "which_word" | "same_different" }
  | { type: "real_world" }
  | { type: "typing"; mode: "listen" | "copy" | "picture" | "answer" };

export function evidenceFor(kind: ExerciseKind): EvidenceWeight[] {
  switch (kind.type) {
    case "listen_repeat":
      return [{ competency: "repeat", weight: 1 }];
    case "letter_sound":
      return kind.mode === "letter_to_sound"
        ? [{ competency: "decode", weight: 1 }]
        : [{ competency: "recognise", weight: 1 }];
    case "picture_match":
      if (kind.mode === "read")
        return [
          { competency: "decode", weight: 1 },
          { competency: "understand_written", weight: 1 },
        ];
      if (kind.mode === "name") return [{ competency: "decode", weight: 1 }];
      return [{ competency: "understand_spoken", weight: 1 }];
    case "word_build":
      return [
        { competency: "write", weight: 1 },
        { competency: "decode", weight: 0.5 },
      ];
    case "listening_comprehension":
      return [{ competency: "understand_spoken", weight: 1 }];
    case "sentence_build":
      return [
        { competency: "write", weight: 1 },
        { competency: "decode", weight: 0.5 },
      ];
    case "reading_comprehension":
      return [
        { competency: "decode", weight: 1 },
        { competency: "understand_written", weight: 1 },
      ];
    case "trace":
      return [{ competency: "write", weight: 1 }];
    case "minimal_pair":
      return [{ competency: "recognise", weight: 1 }];
    case "real_world":
      return [
        { competency: "decode", weight: 1 },
        { competency: "understand_written", weight: 1 },
      ];
    case "typing":
      return [{ competency: "write", weight: 1 }];
  }
}

/** Error types each component can report. Every one must resolve to a feedback clip. */
export function errorTypesFor(kind: ExerciseKind): ErrorType[] {
  switch (kind.type) {
    case "listen_repeat":
      return [];
    case "letter_sound":
      return ["wrong_choice", "letter_shape"];
    case "picture_match":
      return kind.mode === "listen" ? ["meaning"] : ["first_sound", "middle_sound", "last_sound", "meaning"];
    case "word_build":
      return ["first_sound", "middle_sound", "last_sound", "order", "missing_letter"];
    case "listening_comprehension":
      return ["detail"];
    case "sentence_build":
      return ["order", "missing_letter"];
    case "reading_comprehension":
      return ["detail"];
    case "trace":
      return ["trace_off_path"];
    case "minimal_pair":
      return kind.mode === "same_different" ? ["same_different"] : ["first_sound", "middle_sound", "last_sound"];
    case "real_world":
      return ["detail"];
    case "typing":
      return ["typing_mismatch"];
  }
}

/** True when the component shows written text without playing the target first. */
export function isIndependentReadingTask(kind: ExerciseKind): boolean {
  return evidenceFor(kind).some((e) => e.competency === "decode" && e.weight >= 1);
}

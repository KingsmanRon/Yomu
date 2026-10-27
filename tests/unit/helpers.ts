import { evidenceFor, type ExerciseKind } from "@/lib/learning/evidence";
import type { AttemptData, CurriculumMeta, Op } from "@/lib/learning/types";

let counter = 0;
export function nextId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString().padStart(12, "0")}`;
}

export const PROFILE = "profile-a";

/** ISO timestamp on a local date, `minute` minutes after 08:00. */
export function at(date: string, minute = 0): string {
  const h = 8 + Math.floor(minute / 60);
  const m = minute % 60;
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

export function attempt(
  date: string,
  minute: number,
  kind: ExerciseKind,
  overrides: Partial<AttemptData> & { objectiveIds: string[]; itemId: string; outcome: AttemptData["outcome"] },
): Op {
  return {
    id: nextId(),
    profileId: PROFILE,
    type: "attempt",
    at: at(date, minute),
    localDate: date,
    data: {
      lessonId: "l20-blending",
      exerciseId: overrides.exerciseId ?? `l20-blending.e${String(minute % 90).padStart(2, "0")}`,
      exerciseType: kind.type,
      evidence: evidenceFor(kind),
      attemptNumber: 1,
      supported: false,
      ...overrides,
    },
  };
}

export function lessonComplete(date: string, minute: number, lessonId: string, correct = 5, total = 6): Op {
  return {
    id: nextId(),
    profileId: PROFILE,
    type: "lesson_complete",
    at: at(date, minute),
    localDate: date,
    data: { lessonId, correct, total, durationMs: 240_000 },
  };
}

export const META: CurriculumMeta = {
  objectives: {
    "obj.read-cvc": { lessonId: "l20-blending", masteryCompetencies: ["decode"], reading: true },
    "obj.write-cvc": { lessonId: "l20-blending", masteryCompetencies: ["write"], reading: false },
    "obj.sounds": { lessonId: "l10-satp", masteryCompetencies: ["recognise"], reading: false },
    "obj.read-sentence": {
      lessonId: "l30-first-sentences",
      masteryCompetencies: ["decode", "understand_written"],
      reading: true,
    },
  },
  lessons: {
    "l00-hl-vowels": { level: 0, unit: "u0", order: 1, objectives: [] },
    "l10-satp": { level: 1, unit: "u1", order: 1, objectives: ["obj.sounds"] },
    "l11-inmd": { level: 1, unit: "u1", order: 2, objectives: [] },
    "l20-blending": { level: 2, unit: "u2", order: 1, objectives: ["obj.read-cvc", "obj.write-cvc"] },
    "l30-first-sentences": { level: 3, unit: "u3", order: 1, objectives: ["obj.read-sentence"] },
  },
  badges: [
    { id: "b.first-word", criterion: { kind: "objective_mastered", objective: "obj.read-cvc" } },
    { id: "b.streak-3", criterion: { kind: "streak", days: 3 } },
    { id: "b.two-lessons", criterion: { kind: "lessons_completed", count: 2 } },
  ],
};

export const UNIT_ORDER = { u0: 0, u1: 1, u2: 2, u3: 3 };

export const READ: ExerciseKind = { type: "picture_match", mode: "read" };
export const LISTEN_PICTURE: ExerciseKind = { type: "picture_match", mode: "listen" };
export const REPEAT: ExerciseKind = { type: "listen_repeat" };
export const SOUND_TO_LETTER: ExerciseKind = { type: "letter_sound", mode: "sound_to_letter" };
export const WHICH_WORD: ExerciseKind = { type: "minimal_pair", mode: "which_word" };
export const BUILD: ExerciseKind = { type: "word_build", mode: "listen" };

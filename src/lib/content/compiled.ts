/**
 * Shapes of the compiled content the app downloads (public/content/*). The
 * build step (scripts/build-content.ts) turns the authored content into one
 * self-contained file per lesson per teaching language, with every lexicon
 * reference resolved and every audio asset given a URL.
 *
 * Type-only module: safe to import from client code.
 */
import type { Competency, CurriculumMeta, ErrorType, EvidenceWeight } from "@/lib/learning/types";

export type ReviewStatus = "draft" | "native_speaker_reviewed" | "educator_reviewed" | "approved";
export type Lang = "zu" | "st";
export type AudioLang = "zu" | "st" | "en";

export interface CompiledAudio {
  /** Ogg Opus, mono, low bitrate. */
  src: string;
  /** AAC fallback for browsers without Ogg Opus (recorded audio only). */
  srcAac?: string;
  ms: number;
  bytes: number;
  /** No recording exists yet: this is a generated, clearly labelled placeholder tone. */
  placeholder: boolean;
  /** Language actually spoken in the file. The player refuses mismatches. */
  lang: AudioLang;
}

export interface CompiledLine {
  id: string;
  text: string;
  label?: string;
  audio: CompiledAudio | null;
  review: ReviewStatus;
}

export interface CompiledLex {
  id: string;
  lang: AudioLang;
  kind: "letter" | "syllable" | "word" | "sight_word" | "phrase" | "sentence" | "passage";
  text: string;
  image?: string;
  audio: CompiledAudio | null;
  nameAudio?: CompiledAudio | null;
  gloss?: { word: string; line: CompiledLine };
  graphemes?: string[];
  /** Audio of each grapheme's sound, for blending demonstrations (null where none is recorded). */
  graphemeAudio?: (CompiledAudio | null)[];
  irregular?: boolean;
  review: ReviewStatus;
}

export interface CompiledOption {
  id: string;
  image?: string;
  text?: string;
  lex?: string;
}

export interface CompiledTeachStep {
  kind: "teach";
  id: string;
  teach: "explain" | "letter_intro" | "word_intro" | "blend_demo" | "contrast_note";
  line: CompiledLine;
  showText?: string;
  showImage?: string;
  /** Lexicon entry shown (letter, word or sentence), already resolved to the pathway language. */
  lex?: string;
  anchor?: string;
  tag?: { id: string; title: string };
}

interface ExerciseCommon {
  kind: "exercise";
  id: string;
  objectives: string[];
  evidence: EvidenceWeight[];
  errorTypes: ErrorType[];
  instruction: CompiledLine;
  feedback: Partial<Record<ErrorType, CompiledLine>>;
}

export type CompiledExercise = ExerciseCommon &
  (
    | { type: "listen_repeat"; items: string[] }
    | { type: "letter_sound"; mode: "sound_to_letter" | "letter_to_sound" | "hear_in_word"; target: string; prompt?: string; options: string[] }
    | { type: "picture_match"; mode: "read" | "listen" | "name"; target: string; options: string[] }
    | { type: "word_build"; mode: "listen" | "picture"; target: string; tiles: string[] }
    | { type: "listening_comprehension"; audio: string; question: CompiledLine; options: CompiledOption[]; answer: string }
    | { type: "sentence_build"; target: string; tiles: string[] }
    | { type: "reading_comprehension"; passage: string; question: CompiledLine; options: CompiledOption[]; answer: string }
    | { type: "trace"; letter: string; strokes: [number, number][][] }
    | { type: "minimal_pair"; mode: "which_word" | "same_different"; pair: [string, string]; target?: string; same?: boolean }
    | {
        type: "real_world";
        scenario:
          | { kind: "sms"; sender: string; time: string; body: string }
          | { kind: "sign"; text: string }
          | { kind: "form"; title: string; fields: { label: string; value?: string }[] };
        question: CompiledLine;
        options: CompiledOption[];
        answer: string;
      }
    | { type: "typing"; mode: "listen" | "copy" | "picture" | "answer"; target: string; question?: CompiledLine; passage?: string }
  );

export type CompiledStep = CompiledTeachStep | CompiledExercise;

export interface CompiledObjective {
  id: string;
  description: string;
  strand: string;
  masteryCompetencies: Competency[];
  reading: boolean;
  aet: { level: string; outcome: string }[];
  contrastiveTags?: string[];
}

export interface CompiledLesson {
  id: string;
  version: number;
  lang: Lang;
  level: number;
  unit: string;
  order: number;
  minutes: number;
  target: "en" | "home";
  title: { en: string; line: CompiledLine };
  summary: string;
  objectives: CompiledObjective[];
  prerequisites: string[];
  contrastiveTags: string[];
  intro: CompiledLine;
  outro: CompiledLine;
  steps: CompiledStep[];
  lex: Record<string, CompiledLex>;
  /** Lowest review status of anything a learner sees or hears in this lesson. */
  review: ReviewStatus;
  /** Every URL the lesson needs offline, and their total size. */
  assets: { urls: string[]; bytes: number };
}

export interface CatalogLesson {
  id: string;
  level: number;
  unit: string;
  order: number;
  minutes: number;
  target: "en" | "home";
  title: { en: string; zu: CompiledLine; st: CompiledLine };
  summary: string;
  objectives: CompiledObjective[];
  prerequisites: string[];
  review: Record<Lang, ReviewStatus>;
  available: Record<Lang, boolean>;
  bytes: Record<Lang, number>;
}

export interface CatalogBadge {
  id: string;
  icon: string;
  category: "literacy" | "habit";
  title: { en: string; zu: CompiledLine; st: CompiledLine };
}

export interface Catalog {
  contentVersion: string;
  builtAt: string;
  levels: { level: number; title: string; description: string; aetLevel: string }[];
  units: { id: string; level: number; order: number; title: { en: string; zu: CompiledLine; st: CompiledLine }; lessons: string[] }[];
  lessons: CatalogLesson[];
  badges: CatalogBadge[];
  meta: CurriculumMeta;
  unitOrder: Record<string, number>;
}

export interface CompiledClipLibrary {
  lang: Lang;
  clips: Record<string, CompiledLine & { purpose: string }>;
}

export interface CompiledAppLines {
  lang: Lang;
  lines: Record<string, CompiledLine>;
}

export interface CompiledAssessment {
  id: string;
  version: string;
  lang: Lang;
  intro: CompiledLine;
  outro: CompiledLine;
  items: {
    id: string;
    section: string;
    format: "read_picture" | "hear_choose_text";
    target: string;
    options: string[];
    useLetterName?: boolean;
    instruction: CompiledLine;
  }[];
  lex: Record<string, CompiledLex>;
}

export interface LessonPack {
  unit: string;
  lang: Lang;
  lessons: string[];
  urls: string[];
  bytes: number;
}

export interface PrecacheManifest {
  version: string;
  urls: string[];
  bytes: number;
  budgetBytes: number;
}

const ORDER: ReviewStatus[] = ["draft", "native_speaker_reviewed", "educator_reviewed", "approved"];
export function lowestReview(statuses: ReviewStatus[]): ReviewStatus {
  let worst = 3;
  for (const s of statuses) worst = Math.min(worst, ORDER.indexOf(s));
  return ORDER[worst];
}

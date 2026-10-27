/**
 * Types shared by the client (offline engine) and the server (authoritative
 * recomputation). Nothing in this folder may touch the network, storage or
 * the clock: every function is a pure function of its inputs so that the
 * phone and the server always derive identical progress from the same log.
 */

export type Competency =
  | "recognise"
  | "understand_spoken"
  | "repeat"
  | "decode"
  | "understand_written"
  | "write";

export type ErrorType =
  | "wrong_choice"
  | "first_sound"
  | "middle_sound"
  | "last_sound"
  | "letter_shape"
  | "meaning"
  | "order"
  | "missing_letter"
  | "trace_off_path"
  | "typing_mismatch"
  | "same_different"
  | "detail";

export interface EvidenceWeight {
  competency: Competency;
  /** 1 = full evidence. Lower weights contribute but can never reach mastery alone. */
  weight: number;
}

export type AttemptOutcome = "correct" | "incorrect" | "practised";

export interface AttemptData {
  lessonId: string;
  exerciseId: string;
  exerciseType: string;
  /** Lexicon ID of the target item (or exercise ID when there is no single item). */
  itemId: string;
  objectiveIds: string[];
  evidence: EvidenceWeight[];
  outcome: AttemptOutcome;
  /** 1 for the first try at this exercise in this session, 2+ for retries after feedback. */
  attemptNumber: number;
  /**
   * True when the target was played aloud or otherwise revealed before the
   * answer (for example the learner asked the tutor "how does this word
   * sound?"). Supported attempts never count as independent decoding.
   */
  supported: boolean;
  errorType?: ErrorType;
  /** For listen-and-repeat self-checks: did the learner judge their attempt the same as the model? */
  selfCheck?: "same" | "different" | "no_recording";
  responseMs?: number;
  /** True when the attempt was part of a revision session. */
  revision?: boolean;
}

export interface LessonCompleteData {
  lessonId: string;
  correct: number;
  total: number;
  durationMs: number;
  /** Network bytes transferred while the lesson was open (Resource Timing), if measurable. */
  dataBytes?: number;
}

export interface LessonProgressData {
  lessonId: string;
  stepIndex: number;
}

export type AssessmentSection =
  | "hl_decoding"
  | "letter_recognition"
  | "letter_sounds"
  | "sight_words"
  | "sentence_reading"
  | "transfer_decoding";

export interface AssessmentData {
  kind: "placement" | "pre" | "post" | "retake";
  instrument: string;
  skipped: boolean;
  scores: Partial<Record<AssessmentSection, { correct: number; total: number }>>;
  placedLevel: number;
}

export interface LevelChangeData {
  level: number;
  reason: "learner" | "facilitator" | "assessment";
}

interface OpBase {
  /** UUID generated on the device. Doubles as the idempotency key during sync. */
  id: string;
  /** Device-local profile that produced the op. Never mixed between profiles. */
  profileId: string;
  /** Client timestamp, ISO 8601 UTC (Date.toISOString()). */
  at: string;
  /** The device's local calendar date when the op happened (YYYY-MM-DD). Used for streaks. */
  localDate: string;
}

export type Op =
  | (OpBase & { type: "attempt"; data: AttemptData })
  | (OpBase & { type: "lesson_complete"; data: LessonCompleteData })
  | (OpBase & { type: "lesson_progress"; data: LessonProgressData })
  | (OpBase & { type: "assessment"; data: AssessmentData })
  | (OpBase & { type: "level_change"; data: LevelChangeData });

export type OpType = Op["type"];

/** The data payload of an op of the given type. */
export type OpData<T extends OpType> = Extract<Op, { type: T }>["data"];

/* ------------------------------------------------------------------ */
/* Derived state                                                       */
/* ------------------------------------------------------------------ */

export type CompetencyStatus = "not_started" | "practised" | "developing" | "mastered" | "needs_review";
export type ObjectiveStatus = "not_started" | "practised" | "developing" | "mastered" | "needs_review";

export interface CompetencyState {
  status: CompetencyStatus;
  /** Counted evidence events (first attempts; supported attempts excluded for decoding). */
  events: number;
  correct: number;
  firstMasteredAt?: string;
  lastEvidenceAt?: string;
}

export interface ObjectiveState {
  status: ObjectiveStatus;
  firstMasteredAt?: string;
  competencies: Partial<Record<Competency, CompetencyState>>;
}

export interface LessonState {
  completions: number;
  firstCompletedAt?: string;
  lastCompletedAt?: string;
  bestCorrect?: number;
  total?: number;
}

export interface StreakState {
  current: number;
  longest: number;
  graceRemaining: number;
  /** Local dates that counted as active, ascending. */
  activeDates: string[];
  /** Missed local dates that were covered by a grace day. */
  graceDates: string[];
  /** Whether today already counts as an active day. */
  todayActive: boolean;
}

export interface RevisionCard {
  exerciseId: string;
  lessonId: string;
  itemId: string;
  objectiveIds: string[];
  /** Leitner box 1..5. */
  box: number;
  dueDate: string;
  lastOutcome: "correct" | "incorrect";
  lastAttemptAt: string;
  lapses: number;
  /** Local date of the most recent failed independent-decoding attempt, if any. */
  lastFailedDecodeDate?: string;
}

export interface BadgeState {
  earnedAt: string;
}

export interface LevelState {
  current: number;
  placedLevel?: number;
  source: "default" | "placement" | "manual";
}

export interface AssessmentRecord {
  opId: string;
  at: string;
  data: AssessmentData;
}

export interface DerivedState {
  xp: number;
  xpBreakdown: { answers: number; practice: number; lessons: number; mastery: number };
  lessons: Record<string, LessonState>;
  objectives: Record<string, ObjectiveState>;
  streak: StreakState;
  revision: Record<string, RevisionCard>;
  badges: Record<string, BadgeState>;
  level: LevelState;
  assessments: AssessmentRecord[];
  lastLesson?: { lessonId: string; stepIndex: number; at: string };
  attemptCount: number;
  lastActiveDate?: string;
}

/* ------------------------------------------------------------------ */
/* Curriculum metadata needed by the engine                            */
/* ------------------------------------------------------------------ */

export type BadgeCriterion =
  | { kind: "objective_mastered"; objective: string }
  | { kind: "objectives_mastered"; objectives: string[] }
  | { kind: "lesson_completed"; lesson: string }
  | { kind: "streak"; days: number }
  | { kind: "lessons_completed"; count: number };

export interface CurriculumMeta {
  objectives: Record<
    string,
    {
      lessonId: string;
      masteryCompetencies: Competency[];
      reading: boolean;
    }
  >;
  lessons: Record<string, { level: number; unit: string; order: number; objectives: string[] }>;
  badges: { id: string; criterion: BadgeCriterion }[];
}

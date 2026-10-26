/**
 * Content schema: the single source of truth for curriculum files under
 * content/. Validated by scripts/validate-content.ts (structure + cross-file
 * rules) and exported as JSON Schema to content/schema/*.schema.json.
 *
 * This module imports zod and is only used by build scripts, tests and the
 * server. Client code imports the compiled types from ./compiled instead.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const TeachingLanguageSchema = z.enum(["zu", "st"]);
export const ContentLanguageSchema = z.enum(["zu", "st", "en"]);

export const COMPETENCIES = [
  "recognise",
  "understand_spoken",
  "repeat",
  "decode",
  "understand_written",
  "write",
] as const;
export const CompetencySchema = z.enum(COMPETENCIES);

export const REVIEW_STATUSES = ["draft", "native_speaker_reviewed", "educator_reviewed", "approved"] as const;
export const ReviewStatusSchema = z.enum(REVIEW_STATUSES);

export const ReviewerRoleSchema = z.enum([
  "native_speaker",
  "adult_literacy_educator",
  "linguist",
  "aet_specialist",
  "voice_director",
]);

export const ReviewEventSchema = z
  .object({
    status: ReviewStatusSchema,
    role: ReviewerRoleSchema,
    date: z.iso.date(),
    notes: z.string().optional(),
  })
  .strict();

export const ReviewSchema = z
  .object({
    status: ReviewStatusSchema,
    history: z.array(ReviewEventSchema).optional(),
  })
  .strict();

/** Audio asset IDs start with their language: "zu.", "st." or "en.". */
export const AssetIdSchema = z
  .string()
  .regex(/^(zu|st|en)\.[a-z0-9][a-z0-9._-]*$/, "asset IDs look like 'zu.l10.intro' or 'en.w.cat'");

/** ID of a lexicon entry, as defined in content/lexicon/*.json. */
export const LexIdSchema = z
  .string()
  .regex(/^(en|zu|st)\.(l|syl|w|sw|ph|sen|psg)\.[a-z0-9_-]+$/, "lexicon IDs look like 'en.w.cat' or 'zu.syl.ma'");

/**
 * Reference to a lexicon entry from a lesson. `hl.` means "the learner's home
 * language": `hl.l.a` resolves to `zu.l.a` on the isiZulu pathway and to
 * `st.l.a` on the Sesotho pathway. Both resolutions must exist (validated).
 */
export const LexRefSchema = z
  .string()
  .regex(/^(en|zu|st|hl)\.(l|syl|w|sw|ph|sen|psg)\.[a-z0-9_-]+$/, "lexicon references look like 'en.w.cat' or 'hl.l.a'");

export const ImageIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export const ClipIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);
export const ObjectiveIdSchema = z.string().regex(/^obj\.[a-z0-9][a-z0-9.-]*$/);
export const LessonIdSchema = z.string().regex(/^l\d\d-[a-z0-9-]+$/);
export const UnitIdSchema = z.string().regex(/^u\d$/);
export const ContrastTagIdSchema = z.string().regex(/^ct\.[a-z0-9-]+$/);
export const AetOutcomeIdSchema = z.string().regex(/^aet\.[a-z0-9.-]+$/);

/**
 * A line of speech that must be recorded. `text` is the script for the voice
 * talent (and the caption shown under the audio).
 */
export const SpokenLineSchema = z
  .object({
    id: AssetIdSchema,
    text: z.string().min(1),
    /** Context for the voice talent: who is speaking, tone, what the learner sees. */
    note: z.string().optional(),
    /** Target duration in seconds. Estimated from the text when absent. */
    seconds: z.number().positive().max(90).optional(),
    review: ReviewSchema,
  })
  .strict();

/**
 * The same teaching point voiced in the teaching languages. Both are required
 * unless the step is restricted to one pathway (checked by the validator).
 */
export const LocalisedLineSchema = z
  .object({
    zu: SpokenLineSchema.optional(),
    st: SpokenLineSchema.optional(),
  })
  .strict()
  .refine((l) => l.zu || l.st, "a localised line needs at least one language");

/** A spoken line plus a short written label (for buttons and headings). */
export const LabelledLineSchema = SpokenLineSchema.extend({
  label: z.string().min(1).max(40).optional(),
}).strict();

/* ------------------------------------------------------------------ */
/* Lexicon                                                             */
/* ------------------------------------------------------------------ */

export const LexAudioSchema = z
  .object({
    id: AssetIdSchema,
    /** What the speaker says, e.g. "cat", or "/s/ (a long sss, not the letter name)". */
    text: z.string().min(1),
    note: z.string().optional(),
    seconds: z.number().positive().max(90).optional(),
    review: ReviewSchema,
  })
  .strict();

export const GlossSchema = z
  .object({
    /** The home-language word or phrase with the same meaning. */
    word: z.string().min(1),
    /** Spoken explanation of the meaning, e.g. "The word cat means ikati." */
    line: SpokenLineSchema,
  })
  .strict();

export const LexiconEntrySchema = z
  .object({
    id: LexIdSchema,
    lang: ContentLanguageSchema,
    kind: z.enum(["letter", "syllable", "word", "sight_word", "phrase", "sentence", "passage"]),
    /** Written form exactly as displayed. */
    text: z.string().min(1),
    image: ImageIdSchema.optional(),
    /** Model audio in the entry's own language. */
    audio: LexAudioSchema,
    /** Letter name audio (English letters only), used for spelling and forms. */
    nameAudio: LexAudioSchema.optional(),
    /** Meaning in each teaching language. Required for English words used with pictures. */
    gloss: z.object({ zu: GlossSchema, st: GlossSchema }).strict().optional(),
    /** Grapheme segmentation used by blending demonstrations, tiles and error analysis. */
    graphemes: z.array(z.string().min(1)).optional(),
    contrastiveTags: z.array(ContrastTagIdSchema).optional(),
    /** True when spelling does not follow the sound rules taught so far (sight word). */
    irregular: z.boolean().optional(),
  })
  .strict();

export const LexiconFileSchema = z
  .object({
    $schema: z.string().optional(),
    entries: z.array(LexiconEntrySchema).min(1),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Exercises and teaching steps                                        */
/* ------------------------------------------------------------------ */

export const ERROR_TYPES = [
  "wrong_choice",
  "first_sound",
  "middle_sound",
  "last_sound",
  "letter_shape",
  "meaning",
  "order",
  "missing_letter",
  "trace_off_path",
  "typing_mismatch",
  "same_different",
  "detail",
] as const;
export const ErrorTypeSchema = z.enum(ERROR_TYPES);

export const OptionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]+$/),
    image: ImageIdSchema.optional(),
    text: z.string().optional(),
    lex: LexRefSchema.optional(),
  })
  .strict()
  .refine((o) => o.image || o.text || o.lex, "an option needs an image, text or lexicon reference");

const FeedbackMapSchema = z.partialRecord(ErrorTypeSchema, ClipIdSchema);

const exerciseBase = {
  id: z.string().regex(/^l\d\d-[a-z0-9-]+\.e\d\d[a-z]?$/, "exercise IDs look like 'l10-satp.e01'"),
  objectives: z.array(ObjectiveIdSchema).min(1),
  /** Restrict to one teaching-language pathway (Level 0 home-language items). Default: both. */
  pathways: z.array(TeachingLanguageSchema).min(1).optional(),
  /**
   * Spoken instruction in the teaching language, replayable with one button.
   * Give either a lesson-specific `instruction` or a shared `instructionClip`
   * from the clip library (exactly one; checked by the validator).
   */
  instruction: LocalisedLineSchema.optional(),
  instructionClip: ClipIdSchema.optional(),
  /** Feedback clip per error type. Missing types fall back to the type defaults (validated). */
  feedback: FeedbackMapSchema.optional(),
};

export const ListenRepeatSchema = z
  .object({ ...exerciseBase, type: z.literal("listen_repeat"), items: z.array(LexRefSchema).min(1).max(6) })
  .strict();

export const LetterSoundSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("letter_sound"),
    /**
     * sound_to_letter: hear a sound, choose the written letter (recognition).
     * letter_to_sound: see a letter or word with no audio, choose its sound from audio options (decoding).
     * hear_in_word:    hear `prompt` (a word or syllable), choose the letter heard in it (phonemic awareness).
     */
    mode: z.enum(["sound_to_letter", "letter_to_sound", "hear_in_word"]),
    target: LexRefSchema,
    prompt: LexRefSchema.optional(),
    options: z.array(LexRefSchema).min(2).max(4),
  })
  .strict();

export const PictureMatchSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("picture_match"),
    /**
     * read:   see the written word with no audio, choose the picture (independent decoding).
     * listen: hear the word, choose the picture (spoken understanding).
     * name:   see a picture, choose the written word with no audio (decoding).
     */
    mode: z.enum(["read", "listen", "name"]),
    target: LexRefSchema,
    options: z.array(LexRefSchema).min(2).max(4),
  })
  .strict();

export const WordBuildSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("word_build"),
    /** listen: hear the word then build it. picture: see the picture then build it. */
    mode: z.enum(["listen", "picture"]),
    target: LexRefSchema,
    /** Tiles shown (target graphemes plus distractors), in display order. */
    tiles: z.array(z.string().min(1)).min(2).max(10),
  })
  .strict();

export const ListeningComprehensionSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("listening_comprehension"),
    audio: LexRefSchema,
    question: LocalisedLineSchema,
    options: z.array(OptionSchema).min(2).max(4),
    answer: z.string(),
  })
  .strict();

export const SentenceBuildSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("sentence_build"),
    target: LexRefSchema,
    /** Word tiles (target words plus distractors), in display order. */
    tiles: z.array(z.string().min(1)).min(2).max(10),
  })
  .strict();

export const ReadingComprehensionSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("reading_comprehension"),
    passage: LexRefSchema,
    question: LocalisedLineSchema,
    options: z.array(OptionSchema).min(2).max(4),
    answer: z.string(),
  })
  .strict();

const PointSchema = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]);

export const TraceSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("trace"),
    letter: LexRefSchema,
    /** Strokes in a 100x100 box, in writing order. Each stroke is a polyline. */
    strokes: z.array(z.array(PointSchema).min(2)).min(1).max(4),
  })
  .strict();

export const MinimalPairSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("minimal_pair"),
    /**
     * which_word:     hear one word of the pair, choose which written word it was.
     * same_different: hear two sounds, decide whether they are the same.
     */
    mode: z.enum(["which_word", "same_different"]),
    pair: z.tuple([LexRefSchema, LexRefSchema]),
    /** which_word: the word that is played. */
    target: LexRefSchema.optional(),
    /** same_different: the expected answer. */
    same: z.boolean().optional(),
  })
  .strict();

export const RealWorldSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("real_world"),
    scenario: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("sms"),
          sender: z.string(),
          time: z.string(),
          body: z.string(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("sign"),
          /** Rendered as plain text on a neutral sign, so the answer comes from reading, not from a pictogram. */
          text: z.string(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("form"),
          title: z.string(),
          fields: z.array(z.object({ label: z.string(), value: z.string().optional() }).strict()).min(1),
        })
        .strict(),
    ]),
    question: LocalisedLineSchema,
    options: z.array(OptionSchema).min(2).max(4),
    answer: z.string(),
  })
  .strict();

export const TypingSchema = z
  .object({
    ...exerciseBase,
    type: z.literal("typing"),
    /**
     * listen:  hear the word and type it.      copy:   see the word and type it.
     * picture: see a picture and type the word. answer: hear a question about a text and type the answer.
     */
    mode: z.enum(["listen", "copy", "picture", "answer"]),
    target: LexRefSchema,
    question: LocalisedLineSchema.optional(),
  })
  .strict();

export const ExerciseSchema = z.discriminatedUnion("type", [
  ListenRepeatSchema,
  LetterSoundSchema,
  PictureMatchSchema,
  WordBuildSchema,
  ListeningComprehensionSchema,
  SentenceBuildSchema,
  ReadingComprehensionSchema,
  TraceSchema,
  MinimalPairSchema,
  RealWorldSchema,
  TypingSchema,
]);

const teachBase = {
  id: z.string().regex(/^l\d\d-[a-z0-9-]+\.t\d\d[a-z]?$/, "teaching step IDs look like 'l10-satp.t01'"),
  pathways: z.array(TeachingLanguageSchema).min(1).optional(),
  /** Lesson-specific explanation, or a shared `lineClip` from the clip library (exactly one). */
  line: LocalisedLineSchema.optional(),
  lineClip: ClipIdSchema.optional(),
};

export const TeachStepSchema = z.discriminatedUnion("teach", [
  z
    .object({
      ...teachBase,
      teach: z.literal("explain"),
      showText: z.string().optional(),
      showImage: ImageIdSchema.optional(),
      showLex: LexRefSchema.optional(),
    })
    .strict(),
  z.object({ ...teachBase, teach: z.literal("letter_intro"), letter: LexRefSchema, anchor: LexRefSchema.optional() }).strict(),
  z.object({ ...teachBase, teach: z.literal("word_intro"), word: LexRefSchema }).strict(),
  z.object({ ...teachBase, teach: z.literal("blend_demo"), word: LexRefSchema }).strict(),
  z
    .object({
      ...teachBase,
      teach: z.literal("contrast_note"),
      tag: ContrastTagIdSchema,
      showText: z.string().optional(),
      showLex: LexRefSchema.optional(),
    })
    .strict(),
]);

export const StepSchema = z.union([TeachStepSchema, ExerciseSchema]);

/* ------------------------------------------------------------------ */
/* Objectives and lessons                                              */
/* ------------------------------------------------------------------ */

export const AetLinkSchema = z
  .object({
    level: z.enum(["pre-aet", "aet-1", "aet-2", "aet-3", "aet-4"]),
    outcome: AetOutcomeIdSchema,
  })
  .strict();

export const ObjectiveSchema = z
  .object({
    id: ObjectiveIdSchema,
    description: z.string().min(10),
    strand: z.enum([
      "home_language_bridge",
      "phonemic_awareness",
      "phonics",
      "decoding",
      "sight_words",
      "vocabulary",
      "comprehension",
      "writing",
      "functional_reading",
    ]),
    /** Competencies that must all be mastered for the objective to be mastered. */
    masteryCompetencies: z.array(CompetencySchema).min(1),
    /** A reading objective can only be mastered with independent decoding evidence. */
    reading: z.boolean(),
    contrastiveTags: z.array(ContrastTagIdSchema).optional(),
    aet: z.array(AetLinkSchema).min(1),
  })
  .strict();

export const LessonSchema = z
  .object({
    $schema: z.string().optional(),
    id: LessonIdSchema,
    version: z.number().int().positive(),
    level: z.number().int().min(0).max(5),
    unit: UnitIdSchema,
    order: z.number().int().positive(),
    minutes: z.number().int().min(2).max(10),
    /** "home": Level 0 lessons whose target text is the teaching language. */
    target: z.enum(["en", "home"]),
    title: z.object({ en: z.string().min(3), zu: LabelledLineSchema, st: LabelledLineSchema }).strict(),
    summary: z.string().min(10),
    objectives: z.array(ObjectiveSchema).min(1),
    prerequisites: z.array(ObjectiveIdSchema),
    contrastiveTags: z.array(ContrastTagIdSchema),
    intro: LocalisedLineSchema,
    outro: LocalisedLineSchema,
    steps: z.array(StepSchema).min(3),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Other content files                                                 */
/* ------------------------------------------------------------------ */

export const CurriculumSchema = z
  .object({
    $schema: z.string().optional(),
    levels: z
      .array(
        z
          .object({
            level: z.number().int().min(0).max(5),
            title: z.string(),
            description: z.string(),
            aetLevel: z.enum(["pre-aet", "aet-1", "aet-2", "aet-3", "aet-4"]),
          })
          .strict(),
      )
      .min(1),
    units: z
      .array(
        z
          .object({
            id: UnitIdSchema,
            level: z.number().int().min(0).max(5),
            order: z.number().int().positive(),
            title: z.object({ en: z.string(), zu: LabelledLineSchema, st: LabelledLineSchema }).strict(),
            lessons: z.array(LessonIdSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const ClipSchema = z
  .object({
    id: ClipIdSchema,
    purpose: z.enum(["feedback_correct", "feedback_error", "instruction", "tutor", "system"]),
    description: z.string(),
    zu: SpokenLineSchema,
    st: SpokenLineSchema,
  })
  .strict();

export const ClipLibrarySchema = z
  .object({
    $schema: z.string().optional(),
    clips: z.array(ClipSchema).min(1),
  })
  .strict();

export const AppLineSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    description: z.string(),
    zu: LabelledLineSchema,
    st: LabelledLineSchema,
  })
  .strict();

export const AppLinesSchema = z
  .object({
    $schema: z.string().optional(),
    lines: z.array(AppLineSchema).min(1),
  })
  .strict();

export const ContrastTagSchema = z
  .object({
    id: ContrastTagIdSchema,
    languages: z.array(TeachingLanguageSchema).min(1),
    title: z.string(),
    description: z.string(),
    examples: z.array(z.string()).min(1),
    teachingStrategy: z.string(),
    review: ReviewSchema,
  })
  .strict();

export const ContrastTagsFileSchema = z
  .object({ $schema: z.string().optional(), tags: z.array(ContrastTagSchema).min(1) })
  .strict();

export const AetOutcomeSchema = z
  .object({
    id: AetOutcomeIdSchema,
    level: z.enum(["pre-aet", "aet-1", "aet-2", "aet-3", "aet-4"]),
    learningArea: z.string(),
    outcome: z.string(),
    /** SAQA unit standard or curriculum reference, once an accredited specialist has identified it. */
    officialReference: z.string().nullable(),
    status: z.enum(["proposed_unreviewed", "specialist_reviewed"]),
  })
  .strict();

export const AetOutcomesFileSchema = z
  .object({
    $schema: z.string().optional(),
    disclaimer: z.string(),
    outcomes: z.array(AetOutcomeSchema).min(1),
  })
  .strict();

export const BadgeCriterionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("objective_mastered"), objective: ObjectiveIdSchema }).strict(),
  z.object({ kind: z.literal("objectives_mastered"), objectives: z.array(ObjectiveIdSchema).min(1) }).strict(),
  z.object({ kind: z.literal("lesson_completed"), lesson: LessonIdSchema }).strict(),
  z.object({ kind: z.literal("streak"), days: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal("lessons_completed"), count: z.number().int().positive() }).strict(),
]);

export const BadgeSchema = z
  .object({
    id: z.string().regex(/^b\.[a-z0-9-]+$/),
    icon: ImageIdSchema,
    /** literacy badges mark real reading/writing achievements; habit badges mark regular practice. */
    category: z.enum(["literacy", "habit"]),
    title: z.object({ en: z.string(), zu: LabelledLineSchema, st: LabelledLineSchema }).strict(),
    criterion: BadgeCriterionSchema,
  })
  .strict();

export const BadgesFileSchema = z
  .object({ $schema: z.string().optional(), badges: z.array(BadgeSchema).min(1) })
  .strict();

export const ImageManifestEntrySchema = z
  .object({
    id: ImageIdSchema,
    file: z.string().regex(/^images\/[a-z0-9-]+\.svg$/),
    alt: z.string().min(2),
    author: z.string(),
    license: z.string(),
    source: z.string(),
    created: z.iso.date(),
    notes: z.string().optional(),
  })
  .strict();

export const ImageManifestSchema = z
  .object({ $schema: z.string().optional(), images: z.array(ImageManifestEntrySchema).min(1) })
  .strict();

/* Assessment instrument: placement and pilot pre/post. */
export const AssessmentItemSchema = z
  .object({
    id: z.string().regex(/^as\.[a-z0-9.-]+$/),
    section: z.enum(["hl_decoding", "letter_recognition", "letter_sounds", "sight_words", "sentence_reading", "transfer_decoding"]),
    /** Optional: restrict to one pathway (home-language decoding items). */
    pathways: z.array(TeachingLanguageSchema).min(1).optional(),
    /**
     * read_picture: see written text (no audio), choose a picture.
     * hear_choose_text: hear an item, choose the written form.
     */
    format: z.enum(["read_picture", "hear_choose_text"]),
    target: LexIdSchema,
    /** For read_picture: lexicon entries whose images are the options. For hear_choose_text: written options. */
    options: z.array(LexIdSchema).min(2).max(4),
    /** Play the letter name rather than its sound (letter recognition items). */
    useLetterName: z.boolean().optional(),
    instruction: LocalisedLineSchema.optional(),
    instructionClip: ClipIdSchema.optional(),
  })
  .strict();

export const AssessmentSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string(),
    version: z.string(),
    intro: LocalisedLineSchema,
    outro: LocalisedLineSchema,
    items: z.array(AssessmentItemSchema).min(5),
  })
  .strict();

export type Competency = z.infer<typeof CompetencySchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type SpokenLine = z.infer<typeof SpokenLineSchema>;
export type LocalisedLine = z.infer<typeof LocalisedLineSchema>;
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type TeachStep = z.infer<typeof TeachStepSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Objective = z.infer<typeof ObjectiveSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Curriculum = z.infer<typeof CurriculumSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type AppLine = z.infer<typeof AppLineSchema>;
export type ContrastTag = z.infer<typeof ContrastTagSchema>;
export type AetOutcome = z.infer<typeof AetOutcomeSchema>;
export type Badge = z.infer<typeof BadgeSchema>;
export type ImageManifestEntry = z.infer<typeof ImageManifestEntrySchema>;
export type AssessmentItem = z.infer<typeof AssessmentItemSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type ErrorType = z.infer<typeof ErrorTypeSchema>;

export function isExercise(step: Step): step is Exercise {
  return "type" in step;
}

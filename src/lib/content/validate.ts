/**
 * Cross-file content rules. Structure is checked by the zod schema in
 * load.ts; this module checks what a schema cannot: references, both
 * language pathways, answers among options, assets present, mastery being
 * attainable, and orthography. `npm run content:validate` fails CI on any
 * error.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { evidenceFor, errorTypesFor, type ExerciseKind } from "@/lib/learning/evidence";
import type { Competency } from "@/lib/learning/types";
import { collectAudioAssets, resolveLexRef } from "./assets";
import { DEFAULT_FEEDBACK } from "./feedback";
import { orderedLessons, type ContentBundle } from "./load";
import { isExercise, type Exercise, type LocalisedLine, type Step } from "./schema";

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  stats: Record<string, number>;
}

const LANGS = ["zu", "st"] as const;
type Lang = (typeof LANGS)[number];

export function exerciseKind(ex: Exercise): ExerciseKind {
  return ("mode" in ex ? { type: ex.type, mode: ex.mode } : { type: ex.type }) as ExerciseKind;
}

export function stepPathways(step: Step): Lang[] {
  return (step.pathways ?? [...LANGS]) as Lang[];
}

/** The written tokens a learner must produce or recognise for a target. */
export function sentenceTokens(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Heuristics for Lesotho Sesotho spellings that should not appear in South
 * African Sesotho content (see LANGUAGE_CONFIG.st.orthography). Matches are
 * warnings for a native-speaker reviewer, not errors.
 */
const SESOTHO_LESOTHO_FORMS: [RegExp, string][] = [
  [/\blijo\b/i, "dijo"],
  [/\bchelete\b/i, "tjhelete"],
  [/\bjoang\b/i, "jwang"],
  [/\bjoale\b/i, "jwale"],
  [/\bkhomo\b/i, "kgomo"],
  [/\bkhetha\b/i, "kgetha"],
  [/\bli(tlhaku|thuto|polelo|lentswe|tšoantšo)\b/i, "di-"],
  [/š/i, "sh (SA orthography does not use š)"],
  [/\bu\s+(ka|a|tla|ne|ithuta|bala|ngola)\b/i, "o (2nd person singular in SA orthography)"],
];

export function validateContent(bundle: ContentBundle, opts: { checkFiles?: boolean } = {}): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
  const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);
  const checkFiles = opts.checkFiles ?? true;

  /* --- assets: unique IDs, language prefixes ------------------------ */
  const assets = collectAudioAssets(bundle);
  const assetText = new Map<string, string>();
  for (const a of assets) {
    const prev = assetText.get(a.id);
    if (prev !== undefined && prev !== a.text) err(a.usage, `audio asset ID '${a.id}' is used for two different lines`);
    else if (prev !== undefined) err(a.usage, `audio asset ID '${a.id}' is defined twice`);
    assetText.set(a.id, a.text);
  }

  /* --- images --------------------------------------------------------- */
  const imageExists = (id: string, where: string) => {
    const entry = bundle.images.get(id);
    if (!entry) return err(where, `image '${id}' is not in content/images.json (licence and attribution manifest)`);
    if (checkFiles && !existsSync(join(bundle.root, "public", entry.file)))
      err(where, `image file public/${entry.file} is missing`);
  };
  for (const image of bundle.images.values()) imageExists(image.id, "content/images.json");

  /* --- lexicon ---------------------------------------------------------- */
  for (const entry of bundle.lexicon.values()) {
    const where = `lexicon ${entry.id}`;
    if (!entry.audio.id.startsWith(`${entry.lang}.`))
      err(where, `model audio '${entry.audio.id}' must be in the entry's own language (${entry.lang})`);
    if (entry.nameAudio && !entry.nameAudio.id.startsWith(`${entry.lang}.`))
      err(where, `letter-name audio must be in the entry's own language (${entry.lang})`);
    if (entry.gloss) {
      for (const l of LANGS) {
        if (!entry.gloss[l].line.id.startsWith(`${l}.`))
          err(where, `the ${l} meaning must be recorded in ${l}, not '${entry.gloss[l].line.id}'`);
      }
    }
    if (entry.image) imageExists(entry.image, where);
    for (const t of entry.contrastiveTags ?? [])
      if (!bundle.contrastTags.has(t)) err(where, `unknown contrastive tag '${t}'`);
  }

  const lex = (ref: string, lang: Lang, where: string) => {
    const id = resolveLexRef(ref, lang);
    const entry = bundle.lexicon.get(id);
    if (!entry) err(where, `lexicon entry '${id}' (from '${ref}') does not exist`);
    return entry;
  };

  /* --- clips and app lines: both languages, own-language IDs --------- */
  for (const clip of bundle.clips.values()) {
    for (const l of LANGS)
      if (!clip[l].id.startsWith(`${l}.`)) err(`clip ${clip.id}`, `the ${l} line must have an ID starting '${l}.'`);
  }
  for (const line of bundle.appLines.values()) {
    for (const l of LANGS)
      if (!line[l].id.startsWith(`${l}.`)) err(`app line ${line.id}`, `the ${l} line must have an ID starting '${l}.'`);
  }
  const clip = (id: string, where: string) => {
    if (!bundle.clips.has(id)) err(where, `clip '${id}' is not in the tutor clip library`);
  };

  const checkLine = (line: LocalisedLine | undefined, langs: Lang[], where: string, required = true, warnExtra = true) => {
    if (!line) {
      if (required) err(where, "missing spoken line");
      return;
    }
    for (const l of langs) {
      const spoken = line[l];
      if (!spoken) err(where, `missing ${l === "zu" ? "isiZulu" : "Sesotho"} pathway line`);
      else if (!spoken.id.startsWith(`${l}.`)) err(where, `the ${l} line ID '${spoken.id}' must start with '${l}.'`);
    }
    if (warnExtra) {
      for (const l of LANGS) {
        if (!langs.includes(l) && line[l]) warn(where, `has a ${l} line but the step is not on the ${l} pathway`);
      }
    }
  };

  /* --- curriculum ------------------------------------------------------ */
  const lessonById = new Map(bundle.lessons.map((l) => [l.id, l]));
  const lessonUnits = new Map<string, string>();
  for (const unit of bundle.curriculum.units) {
    for (const l of LANGS)
      if (!unit.title[l].id.startsWith(`${l}.`)) err(`unit ${unit.id}`, `title ${l} ID must start with '${l}.'`);
    if (!bundle.curriculum.levels.some((lv) => lv.level === unit.level)) err(`unit ${unit.id}`, `level ${unit.level} is not defined`);
    for (const id of unit.lessons) {
      const lesson = lessonById.get(id);
      if (!lesson) err(`unit ${unit.id}`, `lesson '${id}' does not exist`);
      else {
        if (lessonUnits.has(id)) err(`unit ${unit.id}`, `lesson '${id}' is listed in two units`);
        lessonUnits.set(id, unit.id);
        if (lesson.unit !== unit.id) err(`lesson ${id}`, `lesson says unit '${lesson.unit}' but is listed in unit '${unit.id}'`);
        if (lesson.level !== unit.level) err(`lesson ${id}`, `level ${lesson.level} differs from its unit's level ${unit.level}`);
      }
    }
  }
  for (const lesson of bundle.lessons)
    if (!lessonUnits.has(lesson.id)) err(`lesson ${lesson.id}`, "is not listed in any unit of content/curriculum.json");

  /* --- lessons --------------------------------------------------------- */
  const objectiveLesson = new Map<string, string>();
  const ordered = orderedLessons(bundle);
  const stepIds = new Set<string>();
  let exerciseCount = 0;

  for (const [index, lesson] of ordered.entries()) {
    const where = `lesson ${lesson.id}`;
    for (const l of LANGS) {
      if (!lesson.title[l].id.startsWith(`${l}.`)) err(where, `title ${l} ID must start with '${l}.'`);
    }
    checkLine(lesson.intro, [...LANGS], `${where} intro`);
    checkLine(lesson.outro, [...LANGS], `${where} outro`);

    const ownObjectives = new Set(lesson.objectives.map((o) => o.id));
    for (const o of lesson.objectives) {
      if (objectiveLesson.has(o.id)) err(where, `objective '${o.id}' is already defined in ${objectiveLesson.get(o.id)}`);
      objectiveLesson.set(o.id, lesson.id);
      if (o.masteryCompetencies.includes("repeat"))
        err(`${where} ${o.id}`, "'repeat' cannot be a mastery competency: repeating a word is practice, not mastery");
      if (o.reading && !o.masteryCompetencies.includes("decode"))
        err(`${where} ${o.id}`, "a reading objective must require 'decode' (independent decoding) for mastery");
      for (const a of o.aet) {
        const outcome = bundle.aetOutcomes.get(a.outcome);
        if (!outcome) err(`${where} ${o.id}`, `unknown AET outcome '${a.outcome}'`);
        else if (outcome.level !== a.level) err(`${where} ${o.id}`, `AET outcome '${a.outcome}' is level ${outcome.level}, not ${a.level}`);
      }
      for (const t of o.contrastiveTags ?? []) if (!bundle.contrastTags.has(t)) err(`${where} ${o.id}`, `unknown contrastive tag '${t}'`);
    }
    for (const t of lesson.contrastiveTags) if (!bundle.contrastTags.has(t)) err(where, `unknown contrastive tag '${t}'`);
    for (const p of lesson.prerequisites) {
      const owner = objectiveLesson.get(p);
      if (!owner) err(where, `prerequisite '${p}' is not an objective of an earlier lesson`);
      else if (owner === lesson.id) err(where, `prerequisite '${p}' is one of this lesson's own objectives`);
    }

    // Per-pathway coverage: which objectives and competencies each pathway's exercises evidence.
    const coverage: Record<Lang, Map<string, Map<Competency, number>>> = { zu: new Map(), st: new Map() };
    const exercisesPerLang: Record<Lang, number> = { zu: 0, st: 0 };

    for (const step of lesson.steps) {
      const sw = `${where} step ${step.id}`;
      if (stepIds.has(step.id)) err(sw, "duplicate step ID");
      stepIds.add(step.id);
      if (!step.id.startsWith(`${lesson.id}.`)) err(sw, `step IDs must start with '${lesson.id}.'`);
      const langs = stepPathways(step);

      if (!isExercise(step)) {
        if (!!step.line === !!step.lineClip) err(sw, "give exactly one of 'line' or 'lineClip'");
        if (step.line) checkLine(step.line, langs, sw);
        if (step.lineClip) clip(step.lineClip, sw);
        for (const l of langs) {
          if ("showLex" in step && step.showLex) lex(step.showLex, l, sw);
          if (step.teach === "letter_intro") {
            lex(step.letter, l, sw);
            if (step.anchor) lex(step.anchor, l, sw);
          }
          if (step.teach === "word_intro" || step.teach === "blend_demo") {
            const w = lex(step.word, l, sw);
            if (step.teach === "blend_demo" && w && !w.graphemes) err(sw, `'${w.id}' needs graphemes for a blending demonstration`);
          }
        }
        if ("showImage" in step && step.showImage) imageExists(step.showImage, sw);
        if (step.teach === "contrast_note" && !bundle.contrastTags.has(step.tag)) err(sw, `unknown contrastive tag '${step.tag}'`);
        continue;
      }

      exerciseCount += 1;
      const ex = step;
      const kind = exerciseKind(ex);
      if (!!ex.instruction === !!ex.instructionClip) err(sw, "give exactly one of 'instruction' or 'instructionClip'");
      if (ex.instruction) checkLine(ex.instruction, langs, sw);
      if (ex.instructionClip) clip(ex.instructionClip, sw);
      for (const o of ex.objectives) if (!ownObjectives.has(o)) err(sw, `objective '${o}' is not an objective of this lesson`);

      // Feedback per error type resolves to an existing clip.
      for (const errorType of errorTypesFor(kind)) {
        const clipId = ex.feedback?.[errorType] ?? DEFAULT_FEEDBACK[errorType];
        clip(clipId, `${sw} feedback for '${errorType}'`);
      }
      for (const key of Object.keys(ex.feedback ?? {})) {
        if (!errorTypesFor(kind).includes(key as never)) warn(sw, `feedback for '${key}' can never be shown by a ${ex.type} exercise`);
      }

      for (const l of langs) {
        exercisesPerLang[l] += 1;
        const lw = `${sw} [${l}]`;
        validateExercise(ex, l, lw);
        for (const o of ex.objectives) {
          const comp = coverage[l].get(o) ?? new Map<Competency, number>();
          for (const e of evidenceFor(kind)) {
            // Count full-weight evidence separately so mastery attainability can be checked.
            const key = e.competency;
            comp.set(key, (comp.get(key) ?? 0) + e.weight);
          }
          coverage[l].set(o, comp);
        }
      }
    }

    for (const l of LANGS) {
      if (exercisesPerLang[l] === 0) err(where, `has no exercises on the ${l} pathway`);
      for (const o of lesson.objectives) {
        const comp = coverage[l].get(o.id);
        if (!comp) {
          err(where, `objective '${o.id}' has no exercise on the ${l} pathway`);
          continue;
        }
        for (const c of o.masteryCompetencies) {
          if (!comp.has(c)) err(where, `objective '${o.id}' needs '${c}' evidence on the ${l} pathway, but no exercise provides it`);
        }
        if (o.masteryCompetencies.includes("decode")) {
          const full = lesson.steps.filter(
            (s) =>
              isExercise(s) &&
              stepPathways(s).includes(l) &&
              s.objectives.includes(o.id) &&
              evidenceFor(exerciseKind(s)).some((e) => e.competency === "decode" && e.weight >= 1),
          ).length;
          if (full < 2)
            err(where, `reading objective '${o.id}' has ${full} independent-reading exercise(s) on the ${l} pathway; at least 2 are needed for mastery to be possible`);
        }
      }
    }
    if (lesson.target === "home" && lesson.level !== 0) err(where, "only Level 0 lessons may target the home language");
    if (lesson.target === "en" && lesson.level === 0) err(where, "Level 0 lessons target the home language");
    void index;
  }

  function validateExercise(ex: Exercise, l: Lang, w: string) {
    const opt = (ids: string[]) => ids.map((id) => lex(id, l, w));
    switch (ex.type) {
      case "listen_repeat":
        opt(ex.items);
        break;
      case "letter_sound": {
        const options = opt(ex.options);
        if (!ex.options.includes(ex.target)) err(w, "the target must be one of the options");
        if (new Set(ex.options.map((o) => resolveLexRef(o, l))).size !== ex.options.length) err(w, "duplicate options");
        lex(ex.target, l, w);
        if (ex.mode === "hear_in_word") {
          if (!ex.prompt) err(w, "hear_in_word needs a 'prompt' word to play");
          else lex(ex.prompt, l, w);
        }
        void options;
        break;
      }
      case "picture_match": {
        const options = opt(ex.options);
        if (!ex.options.includes(ex.target)) err(w, "the target must be one of the options");
        const target = lex(ex.target, l, w);
        if (ex.mode !== "name") {
          const images = options.map((o) => o?.image);
          if (images.some((i) => !i)) err(w, "every option needs an image in read/listen mode");
          if (new Set(images).size !== images.length) err(w, "two options share the same picture, so the answer would be ambiguous");
        } else if (!target?.image) err(w, "name mode needs a picture for the target");
        break;
      }
      case "word_build": {
        const target = lex(ex.target, l, w);
        if (target && !target.graphemes) err(w, `'${target.id}' needs graphemes to be built from tiles`);
        if (target?.graphemes) {
          const pool = [...ex.tiles];
          for (const g of target.graphemes) {
            const i = pool.indexOf(g);
            if (i < 0) err(w, `tiles are missing '${g}' needed for '${target.text}'`);
            else pool.splice(i, 1);
          }
        }
        if (ex.mode === "picture" && !target?.image) err(w, "picture mode needs a picture for the target");
        break;
      }
      case "sentence_build": {
        const target = lex(ex.target, l, w);
        if (target) {
          const pool = [...ex.tiles];
          for (const t of sentenceTokens(target.text)) {
            const i = pool.indexOf(t);
            if (i < 0) err(w, `tiles are missing '${t}'`);
            else pool.splice(i, 1);
          }
        }
        break;
      }
      case "listening_comprehension":
      case "reading_comprehension":
      case "real_world": {
        if (ex.type === "listening_comprehension") lex(ex.audio, l, w);
        if (ex.type === "reading_comprehension") lex(ex.passage, l, w);
        checkLine(ex.question, [l], `${w} question`, true, false);
        const ids = ex.options.map((o) => o.id);
        if (new Set(ids).size !== ids.length) err(w, "option IDs must be unique");
        if (!ids.includes(ex.answer)) err(w, `answer '${ex.answer}' is not one of the options`);
        for (const o of ex.options) {
          if (o.image) imageExists(o.image, w);
          if (o.lex) lex(o.lex, l, w);
        }
        const images = ex.options.map((o) => o.image).filter(Boolean);
        if (new Set(images).size !== images.length) err(w, "two options share the same picture");
        break;
      }
      case "trace":
        lex(ex.letter, l, w);
        break;
      case "minimal_pair":
        opt([...ex.pair]);
        if (ex.mode === "which_word") {
          if (!ex.target || !ex.pair.includes(ex.target)) err(w, "which_word needs a target that is one of the pair");
        } else if (ex.same === undefined) err(w, "same_different needs 'same' (the expected answer)");
        break;
      case "typing": {
        const target = lex(ex.target, l, w);
        if (target && !/[a-z]/i.test(target.text)) err(w, "typing target has no letters");
        if (ex.mode === "answer") checkLine(ex.question, [l], `${w} question`, true, false);
        if (ex.passage) lex(ex.passage, l, w);
        if (ex.mode === "picture" && !target?.image) err(w, "picture mode needs a picture");
        break;
      }
    }
  }

  /* --- badges ------------------------------------------------------------ */
  for (const badge of bundle.badges) {
    const w = `badge ${badge.id}`;
    imageExists(badge.icon, w);
    const c = badge.criterion;
    if (c.kind === "objective_mastered" && !objectiveLesson.has(c.objective)) err(w, `unknown objective '${c.objective}'`);
    if (c.kind === "objectives_mastered")
      for (const o of c.objectives) if (!objectiveLesson.has(o)) err(w, `unknown objective '${o}'`);
    if (c.kind === "lesson_completed" && !lessonById.has(c.lesson)) err(w, `unknown lesson '${c.lesson}'`);
  }

  /* --- assessment --------------------------------------------------------- */
  const sectionsPerLang: Record<Lang, Map<string, number>> = { zu: new Map(), st: new Map() };
  for (const item of bundle.assessment.items) {
    const w = `assessment ${item.id}`;
    const langs = (item.pathways ?? [...LANGS]) as Lang[];
    if (!!item.instruction === !!item.instructionClip) err(w, "give exactly one of 'instruction' or 'instructionClip'");
    if (item.instruction) checkLine(item.instruction, langs, w);
    if (item.instructionClip) clip(item.instructionClip, w);
    if (!item.options.includes(item.target)) err(w, "the target must be one of the options");
    for (const l of langs) {
      sectionsPerLang[l].set(item.section, (sectionsPerLang[l].get(item.section) ?? 0) + 1);
      const target = bundle.lexicon.get(item.target);
      if (!target) err(w, `unknown target '${item.target}'`);
      for (const o of item.options) {
        const entry = bundle.lexicon.get(o);
        if (!entry) err(w, `unknown option '${o}'`);
        else if (item.format === "read_picture" && !entry.image) err(w, `option '${o}' needs a picture`);
        else if (entry.lang !== "en" && entry.lang !== l) err(w, `option '${o}' is not in English or ${l}`);
      }
      if (item.useLetterName && !target?.nameAudio) err(w, "useLetterName needs letter-name audio on the target");
    }
  }
  for (const l of LANGS) {
    for (const section of ["hl_decoding", "letter_recognition", "letter_sounds", "sight_words", "sentence_reading", "transfer_decoding"]) {
      if ((sectionsPerLang[l].get(section) ?? 0) < 2) err(`assessment`, `section '${section}' has fewer than 2 items on the ${l} pathway`);
    }
  }

  /* --- orthography (warnings: human review decides) ----------------------- */
  for (const a of assets) {
    if (a.lang !== "st") continue;
    for (const [re, sa] of SESOTHO_LESOTHO_FORMS) {
      if (re.test(a.text)) warn(`audio ${a.id}`, `possible Lesotho orthography '${a.text.match(re)?.[0]}': South African form is '${sa}'`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      lessons: bundle.lessons.length,
      exercises: exerciseCount,
      objectives: objectiveLesson.size,
      lexiconEntries: bundle.lexicon.size,
      clips: bundle.clips.size,
      appLines: bundle.appLines.size,
      images: bundle.images.size,
      audioAssets: assets.length,
      audioAssetsZu: assets.filter((a) => a.lang === "zu").length,
      audioAssetsSt: assets.filter((a) => a.lang === "st").length,
      audioAssetsEn: assets.filter((a) => a.lang === "en").length,
      approvedAssets: assets.filter((a) => a.review === "approved").length,
    },
  };
}

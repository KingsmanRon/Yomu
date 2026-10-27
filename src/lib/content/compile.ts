/**
 * Compiles authored content into what the app downloads: one self-contained
 * file per lesson per teaching language, the Tier 1 clip library, app lines,
 * the placement activity, lesson packs per unit, and the precache list.
 *
 * Pure: the build script supplies the audio index and writes the files.
 */
import { evidenceFor, errorTypesFor } from "@/lib/learning/evidence";
import type { CurriculumMeta, ErrorType } from "@/lib/learning/types";
import { resolveLexRef } from "./assets";
import {
  lowestReview,
  type Catalog,
  type CompiledAppLines,
  type CompiledAssessment,
  type CompiledAudio,
  type CompiledClipLibrary,
  type CompiledExercise,
  type CompiledLesson,
  type CompiledLex,
  type CompiledLine,
  type CompiledStep,
  type Lang,
  type LessonPack,
  type PrecacheManifest,
  type ReviewStatus,
} from "./compiled";
import { DEFAULT_FEEDBACK, CORE_CLIPS } from "./feedback";
import { orderedLessons, type ContentBundle } from "./load";
import { isExercise, type Exercise, type LexiconEntry, type SpokenLine, type Step } from "./schema";
import { exerciseKind, stepPathways } from "./validate";

export interface AudioIndexLike {
  id: string;
  lang: "zu" | "st" | "en";
  src: string;
  srcAac?: string;
  bytes: number;
  ms: number;
  placeholder: boolean;
}

export interface CompileInput {
  bundle: ContentBundle;
  audio: Map<string, AudioIndexLike>;
  imageBytes: (imageId: string) => number;
  contentVersion: string;
  builtAt: string;
  hideUnapproved: boolean;
  /** Lessons precached for offline use from first launch (both languages). */
  precacheLessons: string[];
  precacheBudgetBytes: number;
  shellUrls: string[];
  /** App lines needed offline from first launch; the rest are cached when first used. */
  precacheAppLine: (id: string) => boolean;
}

export interface CompileOutput {
  catalog: Catalog;
  lessons: Record<Lang, CompiledLesson[]>;
  clips: Record<Lang, CompiledClipLibrary>;
  app: Record<Lang, CompiledAppLines>;
  assessment: Record<Lang, CompiledAssessment>;
  packs: Record<Lang, LessonPack[]>;
  precache: PrecacheManifest;
  errors: string[];
}

const LANGS: Lang[] = ["zu", "st"];
export const lessonUrl = (lang: Lang, id: string) => `/content/lessons/${lang}/${id}.json`;
export const imageUrl = (id: string) => `/images/${id}.svg`;

export function compileContent(input: CompileInput): CompileOutput {
  const { bundle, audio } = input;
  const errors: string[] = [];
  const bytesBySrc = new Map([...audio.values()].map((a) => [a.src, a.bytes]));

  const audioFor = (id: string, where: string): CompiledAudio | null => {
    const a = audio.get(id);
    if (!a) {
      errors.push(`${where}: no audio (recording or placeholder) for '${id}'`);
      return null;
    }
    return { src: a.src, srcAac: a.srcAac, ms: a.ms, bytes: a.bytes, placeholder: a.placeholder, lang: a.lang };
  };
  const line = (s: (SpokenLine & { label?: string }) | undefined, where: string): CompiledLine => {
    if (!s) {
      errors.push(`${where}: missing line`);
      return { id: "missing", text: "", audio: null, review: "draft" };
    }
    return { id: s.id, text: s.text, label: s.label, audio: audioFor(s.id, where), review: s.review.status };
  };
  const clipLine = (clipId: string, lang: Lang, where: string): CompiledLine => {
    const clip = bundle.clips.get(clipId);
    if (!clip) {
      errors.push(`${where}: unknown clip '${clipId}'`);
      return { id: clipId, text: "", audio: null, review: "draft" };
    }
    return line(clip[lang], where);
  };

  const graphemeAudio = (entry: LexiconEntry): (CompiledAudio | null)[] | undefined => {
    if (!entry.graphemes) return undefined;
    return entry.graphemes.map((g) => {
      const e = bundle.lexicon.get(`${entry.lang}.l.${g}`) ?? bundle.lexicon.get(`${entry.lang}.syl.${g}`);
      return e ? audioFor(e.audio.id, `grapheme '${g}' of ${entry.id}`) : null;
    });
  };

  const compileLex = (id: string, lang: Lang): CompiledLex | undefined => {
    const e = bundle.lexicon.get(id);
    if (!e) {
      errors.push(`unknown lexicon entry '${id}'`);
      return undefined;
    }
    const gloss = e.gloss ? { word: e.gloss[lang].word, line: line(e.gloss[lang].line, `${id} meaning`) } : undefined;
    const statuses: ReviewStatus[] = [e.audio.review.status];
    if (gloss) statuses.push(gloss.line.review);
    return {
      id: e.id,
      lang: e.lang,
      kind: e.kind,
      text: e.text,
      image: e.image ? imageUrl(e.image) : undefined,
      audio: audioFor(e.audio.id, id),
      nameAudio: e.nameAudio ? audioFor(e.nameAudio.id, `${id} letter name`) : undefined,
      gloss,
      graphemes: e.graphemes,
      graphemeAudio: graphemeAudio(e),
      irregular: e.irregular,
      review: lowestReview(statuses),
    };
  };

  /* ------------------------------------------------------------ lessons */
  const lessons: Record<Lang, CompiledLesson[]> = { zu: [], st: [] };
  const lessonReview: Record<string, Record<Lang, ReviewStatus>> = {};
  for (const lesson of orderedLessons(bundle)) {
    lessonReview[lesson.id] = { zu: "approved", st: "approved" };
    for (const lang of LANGS) {
      const lexIds = new Set<string>();
      const lexFor = (ref: string | undefined) => {
        if (ref) lexIds.add(resolveLexRef(ref, lang));
        return ref ? resolveLexRef(ref, lang) : undefined;
      };
      const lines: CompiledLine[] = [];
      const L = (s: SpokenLine | undefined, where: string) => {
        const c = line(s, where);
        lines.push(c);
        return c;
      };
      const C = (clipId: string, where: string) => {
        const c = clipLine(clipId, lang, where);
        lines.push(c);
        return c;
      };
      const where = `${lesson.id} [${lang}]`;
      const steps: CompiledStep[] = [];
      for (const step of lesson.steps as Step[]) {
        if (!stepPathways(step).includes(lang)) continue;
        if (!isExercise(step)) {
          const tag = step.teach === "contrast_note" ? bundle.contrastTags.get(step.tag) : undefined;
          steps.push({
            kind: "teach",
            id: step.id,
            teach: step.teach,
            line: step.lineClip ? C(step.lineClip, `${where} ${step.id}`) : L(step.line?.[lang], `${where} ${step.id}`),
            showText: "showText" in step ? step.showText : undefined,
            showImage: "showImage" in step && step.showImage ? imageUrl(step.showImage) : undefined,
            lex:
              step.teach === "letter_intro"
                ? lexFor(step.letter)
                : step.teach === "word_intro" || step.teach === "blend_demo"
                  ? lexFor(step.word)
                  : lexFor("showLex" in step ? step.showLex : undefined),
            anchor: step.teach === "letter_intro" ? lexFor(step.anchor) : undefined,
            tag: tag ? { id: tag.id, title: tag.title } : undefined,
          });
          continue;
        }
        steps.push(compileExercise(step, lang, lexFor, L, C, `${where} ${step.id}`));
      }

      const lex: Record<string, CompiledLex> = {};
      for (const id of lexIds) {
        const c = compileLex(id, lang);
        if (c) lex[id] = c;
      }
      const title = line(lesson.title[lang], `${where} title`);
      const intro = L(lesson.intro[lang], `${where} intro`);
      const outro = L(lesson.outro[lang], `${where} outro`);
      const review = lowestReview([title.review, ...lines.map((l) => l.review), ...Object.values(lex).map((l) => l.review)]);
      lessonReview[lesson.id][lang] = review;

      const urls = new Set<string>();
      const addAudio = (a: CompiledAudio | null | undefined) => {
        if (a) urls.add(a.src);
      };
      for (const l of [title, intro, outro, ...lines]) addAudio(l.audio);
      for (const e of Object.values(lex)) {
        addAudio(e.audio);
        addAudio(e.nameAudio);
        addAudio(e.gloss?.line.audio);
        e.graphemeAudio?.forEach(addAudio);
        if (e.image) urls.add(e.image);
      }
      for (const s of steps) {
        if (s.kind === "teach" && s.showImage) urls.add(s.showImage);
        if (s.kind === "exercise" && "options" in s && Array.isArray(s.options))
          for (const o of s.options) if (typeof o === "object" && o.image) urls.add(o.image);
      }
      const bytes = [...urls].reduce((n, u) => n + urlBytes(u), 0);

      lessons[lang].push({
        id: lesson.id,
        version: lesson.version,
        lang,
        level: lesson.level,
        unit: lesson.unit,
        order: lesson.order,
        minutes: lesson.minutes,
        target: lesson.target,
        title: { en: lesson.title.en, line: title },
        summary: lesson.summary,
        objectives: lesson.objectives,
        prerequisites: lesson.prerequisites,
        contrastiveTags: lesson.contrastiveTags,
        intro,
        outro,
        steps,
        lex,
        review,
        assets: { urls: [...urls].sort(), bytes },
      });
    }
  }

  function urlBytes(url: string): number {
    if (url.startsWith("/images/")) return input.imageBytes(url.slice("/images/".length).replace(/\.svg$/, ""));
    return bytesBySrc.get(url) ?? 0;
  }

  function compileExercise(
    ex: Exercise,
    lang: Lang,
    lexFor: (ref: string | undefined) => string | undefined,
    L: (s: SpokenLine | undefined, where: string) => CompiledLine,
    C: (clipId: string, where: string) => CompiledLine,
    where: string,
  ): CompiledExercise {
    const kind = exerciseKind(ex);
    const errorTypes = errorTypesFor(kind);
    const feedback: Partial<Record<ErrorType, CompiledLine>> = {};
    for (const t of errorTypes) feedback[t] = C(ex.feedback?.[t] ?? DEFAULT_FEEDBACK[t], `${where} feedback ${t}`);
    const common = {
      kind: "exercise" as const,
      id: ex.id,
      objectives: ex.objectives,
      evidence: evidenceFor(kind),
      errorTypes,
      instruction: ex.instructionClip ? C(ex.instructionClip, where) : L(ex.instruction?.[lang], `${where} instruction`),
      feedback,
    };
    const many = (refs: string[]) => refs.map((r) => lexFor(r) as string);
    switch (ex.type) {
      case "listen_repeat":
        return { ...common, type: ex.type, items: many(ex.items) };
      case "letter_sound":
        return { ...common, type: ex.type, mode: ex.mode, target: lexFor(ex.target)!, prompt: lexFor(ex.prompt), options: many(ex.options) };
      case "picture_match":
        return { ...common, type: ex.type, mode: ex.mode, target: lexFor(ex.target)!, options: many(ex.options) };
      case "word_build":
        return { ...common, type: ex.type, mode: ex.mode, target: lexFor(ex.target)!, tiles: ex.tiles };
      case "listening_comprehension":
        return {
          ...common, type: ex.type, audio: lexFor(ex.audio)!, question: L(ex.question[lang], `${where} question`),
          options: ex.options.map((o) => ({ ...o, image: o.image ? imageUrl(o.image) : undefined, lex: lexFor(o.lex) })), answer: ex.answer,
        };
      case "sentence_build":
        return { ...common, type: ex.type, target: lexFor(ex.target)!, tiles: ex.tiles };
      case "reading_comprehension":
        return {
          ...common, type: ex.type, passage: lexFor(ex.passage)!, question: L(ex.question[lang], `${where} question`),
          options: ex.options.map((o) => ({ ...o, image: o.image ? imageUrl(o.image) : undefined, lex: lexFor(o.lex) })), answer: ex.answer,
        };
      case "trace":
        return { ...common, type: ex.type, letter: lexFor(ex.letter)!, strokes: ex.strokes as [number, number][][] };
      case "minimal_pair":
        return { ...common, type: ex.type, mode: ex.mode, pair: [lexFor(ex.pair[0])!, lexFor(ex.pair[1])!], target: lexFor(ex.target), same: ex.same };
      case "real_world":
        return {
          ...common, type: ex.type, scenario: ex.scenario, question: L(ex.question[lang], `${where} question`),
          options: ex.options.map((o) => ({ ...o, image: o.image ? imageUrl(o.image) : undefined, lex: lexFor(o.lex) })), answer: ex.answer,
        };
      case "typing":
        return {
          ...common, type: ex.type, mode: ex.mode, target: lexFor(ex.target)!,
          question: ex.question ? L(ex.question[lang], `${where} question`) : undefined, passage: lexFor(ex.passage),
        };
    }
  }

  /* ------------------------------------------------- clips, app lines */
  const clips = {} as Record<Lang, CompiledClipLibrary>;
  const app = {} as Record<Lang, CompiledAppLines>;
  for (const lang of LANGS) {
    clips[lang] = { lang, clips: {} };
    for (const c of bundle.clips.values()) clips[lang].clips[c.id] = { ...line(c[lang], `clip ${c.id}`), purpose: c.purpose };
    app[lang] = { lang, lines: {} };
    for (const l of bundle.appLines.values()) app[lang].lines[l.id] = line(l[lang], `app line ${l.id}`);
  }
  for (const id of [...CORE_CLIPS.correct, CORE_CLIPS.correctReading, CORE_CLIPS.tryAgain, CORE_CLIPS.showAnswer, CORE_CLIPS.mistakesOk]) {
    if (!bundle.clips.has(id)) errors.push(`core clip '${id}' is missing from the clip library`);
  }

  /* ------------------------------------------------------- assessment */
  const assessment = {} as Record<Lang, CompiledAssessment>;
  for (const lang of LANGS) {
    const lex: Record<string, CompiledLex> = {};
    const items = bundle.assessment.items
      .filter((i) => (i.pathways ?? LANGS).includes(lang))
      .map((i) => {
        for (const id of [i.target, ...i.options]) {
          const c = compileLex(id, lang);
          if (c) lex[id] = c;
        }
        return {
          id: i.id,
          section: i.section,
          format: i.format,
          target: i.target,
          options: i.options,
          useLetterName: i.useLetterName,
          instruction: i.instructionClip ? clipLine(i.instructionClip, lang, i.id) : line(i.instruction?.[lang], i.id),
        };
      });
    assessment[lang] = {
      id: bundle.assessment.id,
      version: bundle.assessment.version,
      lang,
      intro: line(bundle.assessment.intro[lang], "assessment intro"),
      outro: line(bundle.assessment.outro[lang], "assessment outro"),
      items,
      lex,
    };
  }

  /* ---------------------------------------------------------- catalog */
  const meta: CurriculumMeta = { objectives: {}, lessons: {}, badges: [] };
  for (const lesson of bundle.lessons) {
    meta.lessons[lesson.id] = { level: lesson.level, unit: lesson.unit, order: lesson.order, objectives: lesson.objectives.map((o) => o.id) };
    for (const o of lesson.objectives)
      meta.objectives[o.id] = { lessonId: lesson.id, masteryCompetencies: o.masteryCompetencies, reading: o.reading };
  }
  meta.badges = bundle.badges.map((b) => ({ id: b.id, criterion: b.criterion }));

  const available = (id: string): Record<Lang, boolean> => ({
    zu: !input.hideUnapproved || lessonReview[id].zu === "approved",
    st: !input.hideUnapproved || lessonReview[id].st === "approved",
  });
  const catalog: Catalog = {
    contentVersion: input.contentVersion,
    builtAt: input.builtAt,
    levels: bundle.curriculum.levels,
    units: bundle.curriculum.units.map((u) => ({
      id: u.id,
      level: u.level,
      order: u.order,
      title: { en: u.title.en, zu: line(u.title.zu, `unit ${u.id}`), st: line(u.title.st, `unit ${u.id}`) },
      lessons: u.lessons,
    })),
    lessons: orderedLessons(bundle).map((lesson) => ({
      id: lesson.id,
      level: lesson.level,
      unit: lesson.unit,
      order: lesson.order,
      minutes: lesson.minutes,
      target: lesson.target,
      title: { en: lesson.title.en, zu: line(lesson.title.zu, lesson.id), st: line(lesson.title.st, lesson.id) },
      summary: lesson.summary,
      objectives: lesson.objectives,
      prerequisites: lesson.prerequisites,
      review: lessonReview[lesson.id],
      available: available(lesson.id),
      bytes: {
        zu: lessons.zu.find((l) => l.id === lesson.id)?.assets.bytes ?? 0,
        st: lessons.st.find((l) => l.id === lesson.id)?.assets.bytes ?? 0,
      },
    })),
    badges: bundle.badges.map((b) => ({
      id: b.id,
      icon: imageUrl(b.icon),
      category: b.category,
      title: { en: b.title.en, zu: line(b.title.zu, b.id), st: line(b.title.st, b.id) },
    })),
    meta,
    unitOrder: Object.fromEntries(bundle.curriculum.units.map((u) => [u.id, u.order])),
  };

  // Hidden lessons (production with HIDE_UNAPPROVED_CONTENT) are not shipped at all.
  for (const lang of LANGS) lessons[lang] = lessons[lang].filter((l) => available(l.id)[lang]);

  /* ------------------------------------------------------------ packs */
  const packs: Record<Lang, LessonPack[]> = { zu: [], st: [] };
  for (const lang of LANGS) {
    for (const unit of bundle.curriculum.units) {
      const ls = lessons[lang].filter((l) => l.unit === unit.id);
      if (ls.length === 0) continue;
      const urls = new Set<string>();
      for (const l of ls) {
        urls.add(lessonUrl(lang, l.id));
        l.assets.urls.forEach((u) => urls.add(u));
      }
      packs[lang].push({
        unit: unit.id,
        lang,
        lessons: ls.map((l) => l.id),
        urls: [...urls].sort(),
        bytes: [...urls].reduce((n, u) => n + urlBytes(u), 0) + ls.reduce((n, l) => n + JSON.stringify(l).length, 0),
      });
    }
  }

  /* --------------------------------------------------------- precache */
  const pre = new Set<string>(input.shellUrls);
  const preBytes = { n: 0 };
  const addUrl = (u: string | undefined) => {
    if (u && !pre.has(u)) {
      pre.add(u);
      preBytes.n += urlBytes(u);
    }
  };
  for (const lang of LANGS) {
    pre.add(`/content/app.${lang}.json`);
    pre.add(`/content/clips.${lang}.json`);
    pre.add(`/content/assessment.${lang}.json`);
    for (const [id, l] of Object.entries(app[lang].lines)) if (input.precacheAppLine(id)) addUrl(l.audio?.src);
    for (const c of Object.values(clips[lang].clips)) addUrl(c.audio?.src);
    for (const l of [assessment[lang].intro, assessment[lang].outro, ...assessment[lang].items.map((i) => i.instruction)]) addUrl(l.audio?.src);
    for (const e of Object.values(assessment[lang].lex)) {
      addUrl(e.audio?.src);
      addUrl(e.nameAudio?.src);
      addUrl(e.image);
    }
    for (const id of input.precacheLessons) {
      const l = lessons[lang].find((x) => x.id === id);
      if (!l) continue;
      pre.add(lessonUrl(lang, id));
      l.assets.urls.forEach(addUrl);
    }
  }
  pre.add("/content/catalog.json");
  const precache: PrecacheManifest = {
    version: input.contentVersion,
    urls: [...pre].sort(),
    bytes: preBytes.n,
    budgetBytes: input.precacheBudgetBytes,
  };

  return { catalog, lessons, clips, app, assessment, packs, precache, errors };
}

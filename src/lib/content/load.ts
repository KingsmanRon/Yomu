/**
 * Reads and parses every content file. Used by build scripts, tests and the
 * server (never bundled for the browser).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { z } from "zod";
import {
  AetOutcomesFileSchema,
  AppLinesSchema,
  AssessmentSchema,
  BadgesFileSchema,
  ClipLibrarySchema,
  ContrastTagsFileSchema,
  CurriculumSchema,
  ImageManifestSchema,
  LessonSchema,
  LexiconFileSchema,
  type AetOutcome,
  type AppLine,
  type Assessment,
  type Badge,
  type Clip,
  type ContrastTag,
  type Curriculum,
  type ImageManifestEntry,
  type Lesson,
  type LexiconEntry,
} from "./schema";

export interface ContentBundle {
  root: string;
  curriculum: Curriculum;
  lessons: Lesson[];
  lexicon: Map<string, LexiconEntry>;
  clips: Map<string, Clip>;
  appLines: Map<string, AppLine>;
  contrastTags: Map<string, ContrastTag>;
  aetOutcomes: Map<string, AetOutcome>;
  aetDisclaimer: string;
  badges: Badge[];
  images: Map<string, ImageManifestEntry>;
  assessment: Assessment;
}

export interface LoadResult {
  bundle: ContentBundle | null;
  errors: string[];
}

function readJson(file: string, errors: string[]): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${file}: cannot read JSON (${(e as Error).message})`);
    return undefined;
  }
}

function parse<T>(schema: z.ZodType<T>, file: string, root: string, errors: string[]): T | undefined {
  const raw = readJson(file, errors);
  if (raw === undefined) return undefined;
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${relative(root, file)}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return undefined;
  }
  return result.data;
}

export function loadContent(root: string = process.cwd()): LoadResult {
  const errors: string[] = [];
  const dir = join(root, "content");
  const p = (...parts: string[]) => join(dir, ...parts);

  const curriculum = parse(CurriculumSchema, p("curriculum.json"), root, errors);
  const lessonFiles = existsSync(p("lessons"))
    ? readdirSync(p("lessons")).filter((f) => f.endsWith(".json")).sort()
    : [];
  const lessons: Lesson[] = [];
  for (const f of lessonFiles) {
    const lesson = parse(LessonSchema, p("lessons", f), root, errors);
    if (lesson) {
      if (`${lesson.id}.json` !== f) errors.push(`content/lessons/${f}: file name must be '${lesson.id}.json'`);
      lessons.push(lesson);
    }
  }

  const lexicon = new Map<string, LexiconEntry>();
  for (const lang of ["en", "zu", "st"]) {
    const file = parse(LexiconFileSchema, p("lexicon", `${lang}.json`), root, errors);
    for (const entry of file?.entries ?? []) {
      if (lexicon.has(entry.id)) errors.push(`content/lexicon/${lang}.json: duplicate lexicon ID '${entry.id}'`);
      if (entry.lang !== lang) errors.push(`content/lexicon/${lang}.json: '${entry.id}' has lang '${entry.lang}'`);
      if (!entry.id.startsWith(`${lang}.`)) errors.push(`content/lexicon/${lang}.json: '${entry.id}' must start with '${lang}.'`);
      lexicon.set(entry.id, entry);
    }
  }

  const toMap = <T extends { id: string }>(items: T[] | undefined, label: string): Map<string, T> => {
    const map = new Map<string, T>();
    for (const item of items ?? []) {
      if (map.has(item.id)) errors.push(`${label}: duplicate ID '${item.id}'`);
      map.set(item.id, item);
    }
    return map;
  };

  const clips = toMap(parse(ClipLibrarySchema, p("tutor", "clips.json"), root, errors)?.clips, "content/tutor/clips.json");
  const appLines = toMap(parse(AppLinesSchema, p("app", "lines.json"), root, errors)?.lines, "content/app/lines.json");
  const contrastTags = toMap(
    parse(ContrastTagsFileSchema, p("linguistics", "contrastive-tags.json"), root, errors)?.tags,
    "content/linguistics/contrastive-tags.json",
  );
  const aetFile = parse(AetOutcomesFileSchema, p("aet", "outcomes.json"), root, errors);
  const aetOutcomes = toMap(aetFile?.outcomes, "content/aet/outcomes.json");
  const badges = parse(BadgesFileSchema, p("badges.json"), root, errors)?.badges ?? [];
  const images = toMap(parse(ImageManifestSchema, p("images.json"), root, errors)?.images, "content/images.json");
  const assessment = parse(AssessmentSchema, p("assessment", "placement.json"), root, errors);

  if (!curriculum || !assessment || errors.length > 0) return { bundle: null, errors };
  return {
    bundle: {
      root,
      curriculum,
      lessons,
      lexicon,
      clips,
      appLines,
      contrastTags,
      aetOutcomes,
      aetDisclaimer: aetFile?.disclaimer ?? "",
      badges,
      images,
      assessment,
    },
    errors,
  };
}

/** Lessons in curriculum order (level, unit order, lesson order). */
export function orderedLessons(bundle: ContentBundle): Lesson[] {
  const unitOrder = new Map(bundle.curriculum.units.map((u) => [u.id, u.order]));
  return [...bundle.lessons].sort(
    (a, b) => a.level - b.level || (unitOrder.get(a.unit) ?? 0) - (unitOrder.get(b.unit) ?? 0) || a.order - b.order,
  );
}

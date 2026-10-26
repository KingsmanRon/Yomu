import type { ContentBundle } from "./load";
import { isExercise, type LocalisedLine, type ReviewStatus, type SpokenLine } from "./schema";

export type AudioLanguage = "zu" | "st" | "en";

/** One line of audio that has to be recorded. */
export interface AudioAsset {
  id: string;
  lang: AudioLanguage;
  text: string;
  note?: string;
  seconds?: number;
  review: ReviewStatus;
  /** Where the line is used, for the recording manifest and reviewers. */
  usage: string;
  lessonId?: string;
  kind: "teaching" | "instruction" | "feedback" | "tutor" | "app" | "model_audio" | "gloss" | "assessment" | "title";
}

export function assetLanguage(id: string): AudioLanguage {
  return id.slice(0, 2) as AudioLanguage;
}

/** Resolve a lesson reference: `hl.l.a` becomes `zu.l.a` or `st.l.a`. */
export function resolveLexRef(ref: string, lang: "zu" | "st"): string {
  return ref.startsWith("hl.") ? `${lang}.${ref.slice(3)}` : ref;
}

/** Estimated spoken duration when the content does not give one. */
export function estimateSeconds(text: string, lang: AudioLanguage): number {
  const charsPerSecond = lang === "en" ? 14 : 13;
  return Math.round(Math.max(1, text.length / charsPerSecond + 0.4) * 10) / 10;
}

export function collectAudioAssets(bundle: ContentBundle): AudioAsset[] {
  const out: AudioAsset[] = [];
  const add = (line: SpokenLine | undefined, usage: string, kind: AudioAsset["kind"], lessonId?: string) => {
    if (!line) return;
    out.push({
      id: line.id,
      lang: assetLanguage(line.id),
      text: line.text,
      note: line.note,
      seconds: line.seconds,
      review: line.review.status,
      usage,
      lessonId,
      kind,
    });
  };
  const addLocal = (l: LocalisedLine | undefined, usage: string, kind: AudioAsset["kind"], lessonId?: string) => {
    if (!l) return;
    add(l.zu, usage, kind, lessonId);
    add(l.st, usage, kind, lessonId);
  };

  for (const unit of bundle.curriculum.units) {
    add(unit.title.zu, `unit ${unit.id} title`, "title");
    add(unit.title.st, `unit ${unit.id} title`, "title");
  }
  for (const lesson of bundle.lessons) {
    add(lesson.title.zu, `lesson ${lesson.id} title`, "title", lesson.id);
    add(lesson.title.st, `lesson ${lesson.id} title`, "title", lesson.id);
    addLocal(lesson.intro, `lesson ${lesson.id} introduction`, "teaching", lesson.id);
    addLocal(lesson.outro, `lesson ${lesson.id} closing`, "teaching", lesson.id);
    for (const step of lesson.steps) {
      if (isExercise(step)) {
        addLocal(step.instruction, `exercise ${step.id} instruction`, "instruction", lesson.id);
        if ("question" in step) addLocal(step.question, `exercise ${step.id} question`, "instruction", lesson.id);
      } else {
        addLocal(step.line, `teaching step ${step.id} (${step.teach})`, "teaching", lesson.id);
      }
    }
  }
  for (const entry of bundle.lexicon.values()) {
    out.push({
      id: entry.audio.id,
      lang: assetLanguage(entry.audio.id),
      text: entry.audio.text,
      note: entry.audio.note,
      seconds: entry.audio.seconds,
      review: entry.audio.review.status,
      usage: `model audio for ${entry.kind} '${entry.text}'`,
      kind: "model_audio",
    });
    if (entry.nameAudio) {
      out.push({
        id: entry.nameAudio.id,
        lang: assetLanguage(entry.nameAudio.id),
        text: entry.nameAudio.text,
        note: entry.nameAudio.note,
        seconds: entry.nameAudio.seconds,
        review: entry.nameAudio.review.status,
        usage: `letter name for '${entry.text}'`,
        kind: "model_audio",
      });
    }
    if (entry.gloss) {
      add(entry.gloss.zu.line, `meaning of '${entry.text}'`, "gloss");
      add(entry.gloss.st.line, `meaning of '${entry.text}'`, "gloss");
    }
  }
  for (const clip of bundle.clips.values()) {
    const kind = clip.purpose === "instruction" ? "instruction" : clip.purpose === "tutor" ? "tutor" : clip.purpose === "system" ? "app" : "feedback";
    add(clip.zu, `tutor clip ${clip.id}: ${clip.description}`, kind);
    add(clip.st, `tutor clip ${clip.id}: ${clip.description}`, kind);
  }
  for (const line of bundle.appLines.values()) {
    add(line.zu, `app: ${line.description}`, "app");
    add(line.st, `app: ${line.description}`, "app");
  }
  for (const badge of bundle.badges) {
    add(badge.title.zu, `badge ${badge.id}`, "app");
    add(badge.title.st, `badge ${badge.id}`, "app");
  }
  addLocal(bundle.assessment.intro, "placement activity introduction", "assessment");
  addLocal(bundle.assessment.outro, "placement activity closing", "assessment");
  for (const item of bundle.assessment.items) addLocal(item.instruction, `placement item ${item.id}`, "assessment");
  return out;
}

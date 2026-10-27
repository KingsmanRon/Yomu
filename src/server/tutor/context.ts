import "server-only";
import { helpOptions, targetLexId } from "@/lib/tutor/tier1";
import type { IntentRequest, TeachingLang } from "../providers/types";
import { loadCompiledLesson } from "../catalog";

/**
 * What is on the learner's screen, in English, for the classifier: built on
 * the server from the compiled lesson, so nothing the device sends is passed
 * to a provider except the question itself.
 */
export function tutorContext(lang: TeachingLang, lessonId: string, stepId: string): IntentRequest["context"] | null {
  const lesson = loadCompiledLesson(lang, lessonId);
  const step = lesson?.steps.find((s) => s.id === stepId);
  if (!lesson || !step) return null;
  const available = helpOptions(step, lesson.lex, { spokenQuestions: false }).map((o) => o.id);
  if (step.kind === "teach") {
    const target = step.lex ? lesson.lex[step.lex] : undefined;
    return { lessonTitle: lesson.title.en, stepKind: "teach", targetText: target?.text, availableHelp: available };
  }
  const lexId = targetLexId(step);
  return {
    lessonTitle: lesson.title.en,
    stepKind: "exercise",
    exerciseType: step.type,
    targetText: lexId ? lesson.lex[lexId]?.text : undefined,
    availableHelp: available,
  };
}

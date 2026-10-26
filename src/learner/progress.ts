"use client";

import { useMemo } from "react";
import type { CatalogLesson } from "@/lib/content/compiled";
import { lessonAvailability, orderedLessonIds, recommendedLesson, type LessonAvailability } from "@/lib/learning/path";
import { dueCards } from "@/lib/learning/revision";
import type { RevisionCard } from "@/lib/learning/types";
import { useLearner } from "./state";

export interface PathView {
  lessons: CatalogLesson[];
  availability: Record<string, LessonAvailability>;
  recommended: { lessonId: string; resumeStep: number } | null;
  due: RevisionCard[];
}

/** Lessons available in the learner's language, in prerequisite order, with what is open. */
export function usePath(): PathView | null {
  const { catalog, derived, lang, today } = useLearner();
  return useMemo(() => {
    if (!catalog || !derived || !lang) return null;
    const available = new Set(catalog.lessons.filter((l) => l.available[lang]).map((l) => l.id));
    const meta = {
      ...catalog.meta,
      lessons: Object.fromEntries(Object.entries(catalog.meta.lessons).filter(([id]) => available.has(id))),
    };
    const order = orderedLessonIds(meta, catalog.unitOrder);
    const byId = new Map(catalog.lessons.map((l) => [l.id, l]));
    return {
      lessons: order.map((id) => byId.get(id)!).filter(Boolean),
      availability: lessonAvailability(meta, derived, order),
      recommended: recommendedLesson(meta, derived, order),
      due: dueCards(derived.revision, today, derived.objectives).filter((c) => available.has(c.lessonId)),
    };
  }, [catalog, derived, lang, today]);
}

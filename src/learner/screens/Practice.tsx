"use client";

import { useEffect, useState } from "react";
import type { CompiledLesson } from "@/lib/content/compiled";
import { track } from "../analytics";
import { loadLesson } from "../content";
import { LessonPlayer, type PlayerItem } from "../lesson/LessonPlayer";
import { usePath } from "../progress";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconCheck, IconPlay } from "../ui/icons";
import { BottomNav, Caption, ListenButton, Screen, SpeakButton, Spinner, TopBar } from "../ui/kit";
import { useSpeech } from "../ui/speech";

/**
 * Spaced revision: the exercises that are due, most important first (failed
 * independent reading first, then fresh mistakes, then overdue items). Uses
 * the original exercises, so practice matches what was taught.
 */
export function Practice() {
  const { lang, line, profile } = useLearner();
  const { speak } = useSpeech();
  const path = usePath();
  const [items, setItems] = useState<PlayerItem[] | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!lang || !path || playing) return;
    let cancelled = false;
    (async () => {
      const lessons = new Map<string, CompiledLesson>();
      const out: PlayerItem[] = [];
      for (const card of path.due) {
        try {
          const lesson = lessons.get(card.lessonId) ?? (await loadLesson(lang, card.lessonId));
          lessons.set(card.lessonId, lesson);
          const step = lesson.steps.find((s) => s.id === card.exerciseId);
          if (step && step.kind === "exercise") out.push({ step, lessonId: lesson.id, lex: lesson.lex });
        } catch {
          // Lesson not on this phone and no connection: skip that card for now.
        }
      }
      if (!cancelled) setItems(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, path?.due.length, playing]);

  useEffect(() => {
    if (!lang || !items) return;
    void speak({ line: line(items.length ? "revision.intro" : "revision.empty"), lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items === null, lang]);

  if (!lang || !profile || !path || !items) return <Spinner />;

  if (playing && items.length > 0)
    return (
      <LessonPlayer
        items={items}
        lang={lang}
        mode="revision"
        onExit={() => setPlaying(false)}
        onFinish={async (r) => {
          void track("revision_complete", { correct: r.correct, total: r.total }, profile.id);
          await speak({ line: line("revision.done"), lang });
          setPlaying(false);
          navigate("/home");
        }}
      />
    );

  return (
    <Screen label="practice">
      <TopBar onListen={() => void speak({ line: line(items.length ? "revision.intro" : "revision.empty"), lang })} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {items.length > 0 ? (
          <>
            <Caption line={line("revision.intro")} className="items-center" />
            <span className="text-6xl font-extrabold text-accent" data-testid="practice-count">
              {items.length}
            </span>
            <SpeakButton testId="practice-start" speech={line("home.revise")} onClick={() => setPlaying(true)} className="w-full">
              <IconPlay size={32} />
              <span>{line("home.revise")?.label}</span>
            </SpeakButton>
          </>
        ) : (
          <>
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-good text-white">
              <IconCheck size={56} />
            </span>
            <Caption line={line("revision.empty")} className="items-center" />
            <ListenButton onListen={() => void speak({ line: line("revision.empty"), lang })} />
          </>
        )}
      </div>
      <BottomNav active="practice" />
    </Screen>
  );
}

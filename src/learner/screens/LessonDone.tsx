"use client";

import { useEffect, useMemo } from "react";
import { usePath } from "../progress";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconCheck, IconContinue, IconFlame, IconHome, IconStar } from "../ui/icons";
import { Caption, Picture, Screen, SpeakButton, Spinner } from "../ui/kit";
import { useSpeech } from "../ui/speech";
import type { LessonDoneState } from "./LessonScreen";

/** Lesson completion: what was achieved, calmly, with the next step. */
export function LessonDone({ lessonId }: { lessonId: string }) {
  const { lang, line, derived, catalog } = useLearner();
  const { speak } = useSpeech();
  const path = usePath();
  const state = useMemo<LessonDoneState | null>(() => {
    try {
      const raw = sessionStorage.getItem("yomu:lessonDone");
      const s = raw ? (JSON.parse(raw) as LessonDoneState) : null;
      return s?.lessonId === lessonId ? s : null;
    } catch {
      return null;
    }
  }, [lessonId]);

  const newBadges = useMemo(() => {
    if (!derived || !catalog || !state) return [];
    return catalog.badges.filter((b) => derived.badges[b.id] && !state.badgesBefore.includes(b.id));
  }, [derived, catalog, state]);

  useEffect(() => {
    if (!lang) return;
    const items = [{ line: line("lesson.complete"), lang }];
    if (newBadges.length) items.push({ line: line("badge.earned"), lang }, ...newBadges.map((b) => ({ line: b.title[lang], lang })));
    if (derived?.streak.todayActive) items.push({ line: line("home.streak"), lang });
    void speak(...items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, newBadges.length]);

  if (!lang || !derived || !path) return <Spinner />;
  const gained = state ? derived.xp - state.xpBefore : null;
  const next = path.recommended && path.recommended.lessonId !== lessonId ? path.recommended.lessonId : null;

  return (
    <Screen label="lesson finished" className="gap-6 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="pop-in flex h-28 w-28 items-center justify-center rounded-full bg-good text-white">
          <IconCheck size={64} />
        </span>
        <Caption line={line("lesson.complete")} className="items-center" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3" data-testid="done-score">
          <IconCheck size={28} className="text-good" />
          <span className="text-2xl font-extrabold">{state ? `${state.correct}/${state.total}` : "–"}</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3" data-testid="done-xp">
          <IconStar size={28} className="text-[#d97706]" />
          <span className="text-2xl font-extrabold">{gained !== null ? `+${gained}` : derived.xp}</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3" data-testid="done-streak">
          <IconFlame size={28} className="text-accent" />
          <span className="text-2xl font-extrabold">{derived.streak.current}</span>
        </div>
      </div>
      {newBadges.length > 0 && (
        <div className="flex flex-col gap-3 rounded-3xl bg-accent-soft p-4" data-testid="new-badges">
          {newBadges.map((b) => (
            <div key={b.id} className="flex items-center gap-3 text-left">
              <Picture src={b.icon} className="h-16 w-16" />
              <span className="text-lg font-bold">{b.title[lang].label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-col gap-3">
        {next && (
          <SpeakButton testId="next-lesson" speech={line("lesson.next")} onClick={() => navigate(`/lesson/${next}`, { replace: true })} className="w-full">
            <IconContinue size={32} />
            <span>{line("lesson.next")?.label}</span>
          </SpeakButton>
        )}
        <SpeakButton testId="done-home" variant="secondary" speech={line("nav.learn")} onClick={() => navigate("/home", { replace: true })} className="w-full">
          <IconHome size={32} />
        </SpeakButton>
      </div>
    </Screen>
  );
}

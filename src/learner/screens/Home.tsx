"use client";

import { useEffect, useState } from "react";
import { api } from "../offline/api";
import { useOnline } from "../offline/network";
import { usePath } from "../progress";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconContinue, IconFlame, IconGroup, IconPath, IconPractice, IconShield, IconStar } from "../ui/icons";
import { BottomNav, Caption, ListenButton, Picture, ReviewMarker, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeech } from "../ui/speech";

interface ClassInfo {
  cohortId: string;
  name: string;
  encouragement: { lessonsThisWeek: number; learnersActive: number } | null;
}

/** Learning dashboard: resume or start the next lesson, practise, and see the streak. */
export function Home() {
  const { lang, line, profile, derived, catalog, ready } = useLearner();
  const { speak } = useSpeech();
  const path = usePath();
  const online = useOnline();
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  useEffect(() => {
    if (ready && !profile) navigate("/", { replace: true });
  }, [ready, profile]);

  // Greet once per app session.
  useEffect(() => {
    if (!lang || !line("home.greeting")) return;
    try {
      if (sessionStorage.getItem("greeted")) return;
      sessionStorage.setItem("greeted", "1");
    } catch {
      // Storage unavailable: greet anyway.
    }
    void speak({ line: line("home.greeting"), lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, line("home.greeting")?.id]);

  useEffect(() => {
    if (!profile?.learnerId || !online) return;
    api<{ classes: ClassInfo[] }>(profile.id, "/api/learner/cohorts")
      .then((r) => setClasses(r.classes))
      .catch(() => {});
  }, [profile?.id, profile?.learnerId, online]);

  if (!lang || !profile || !derived || !catalog || !path) return <Spinner />;
  const rec = path.recommended ? path.lessons.find((l) => l.id === path.recommended?.lessonId) : null;
  const resuming = !!path.recommended && path.recommended.resumeStep > 0;

  return (
    <Screen label="home">
      <TopBar showStats onListen={() => void speak({ line: line("home.greeting"), lang })} />

      <div className="flex items-center gap-3 pb-4">
        <Picture src={`/images/${profile.avatarId}.svg`} className="h-14 w-14" />
        <Caption line={line("home.greeting")} />
      </div>

      {rec ? (
        <button
          type="button"
          data-testid="continue-lesson"
          onClick={() => navigate(`/lesson/${rec.id}`)}
          className="pop-in mb-4 flex w-full items-center gap-4 rounded-3xl bg-primary p-5 text-left text-white shadow-[0_6px_0_0_var(--color-primary-dark)] active:translate-y-1 active:shadow-none"
        >
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <IconContinue size={48} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-2xl font-extrabold">{line("home.continue")?.label}</span>
            <span className="text-base font-medium opacity-95">{rec.title[lang].label ?? rec.title[lang].text}</span>
            <span className="flex items-center gap-2 text-sm opacity-90">
              {resuming && <span className="rounded-full bg-white/20 px-2">…</span>}
              <ReviewMarker status={rec.review[lang]} />
            </span>
          </span>
        </button>
      ) : (
        <div className="mb-4 rounded-3xl bg-good-soft p-5">
          <Caption line={line("home.all_done")} always />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          data-testid="home-practice"
          onClick={() => navigate("/practice")}
          className="flex flex-col items-start gap-2 rounded-3xl border-2 border-line bg-white p-4 text-left"
        >
          <IconPractice size={36} className="text-accent" />
          <span className="text-lg font-bold">{line("home.revise")?.label}</span>
          <span className="text-3xl font-extrabold text-accent" data-testid="due-count">
            {path.due.length}
          </span>
        </button>
        <button
          type="button"
          data-testid="home-path"
          onClick={() => navigate("/path")}
          className="flex flex-col items-start gap-2 rounded-3xl border-2 border-line bg-white p-4 text-left"
        >
          <IconPath size={36} className="text-primary" />
          <span className="text-lg font-bold">{line("nav.learn")?.label}</span>
          <span className="text-3xl font-extrabold text-primary">
            {Object.values(path.availability).filter((a) => a === "completed").length}/{path.lessons.length}
          </span>
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-3xl bg-white p-4">
        <span className="flex items-center gap-2 text-2xl font-extrabold text-accent">
          <IconFlame size={36} /> {derived.streak.current}
        </span>
        <span className="flex items-center gap-1 text-ink-soft" aria-label="grace days">
          {Array.from({ length: derived.streak.graceRemaining }, (_, i) => (
            <IconShield key={i} size={24} className="text-primary" />
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2 text-2xl font-extrabold text-[#b45309]">
          <IconStar size={32} className="text-[#d97706]" /> {derived.xp}
        </span>
        {derived.streak.todayActive && (
          <ListenButton size="sm" onListen={() => void speak({ line: line("home.streak"), lang })} />
        )}
      </div>

      {classes
        .filter((c) => c.encouragement)
        .map((c) => (
          <div key={c.cohortId} data-testid="class-encouragement" className="mt-4 flex items-center gap-3 rounded-3xl bg-primary-soft p-4 text-primary">
            <IconGroup size={36} />
            <span className="text-lg font-bold">
              {c.name}: {c.encouragement!.lessonsThisWeek} <IconStar size={18} className="inline" />
            </span>
          </div>
        ))}

      <BottomNav active="learn" />
    </Screen>
  );
}

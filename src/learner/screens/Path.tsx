"use client";

import { usePath } from "../progress";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconCheck, IconLock, IconPlay } from "../ui/icons";
import { BottomNav, Caption, ListenButton, ReviewMarker, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeakOnMount, useSpeech } from "../ui/speech";

/** The learning path: units in order, each lesson as a large circle. */
export function Path() {
  const { lang, line, catalog } = useLearner();
  const { speak } = useSpeech();
  const path = usePath();
  useSpeakOnMount(lang && line("path.intro") ? [{ line: line("path.intro"), lang }] : null, [lang]);
  if (!lang || !catalog || !path) return <Spinner />;

  const units = catalog.units
    .map((u) => ({ ...u, lessons: path.lessons.filter((l) => l.unit === u.id) }))
    .filter((u) => u.lessons.length > 0);

  return (
    <Screen label="lessons">
      <TopBar onBack={() => navigate("/home")} onListen={() => void speak({ line: line("path.intro"), lang })} />
      <div className="flex flex-col gap-8 pb-6">
        {units.map((u) => (
          <section key={u.id} aria-label={u.title.en} className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl bg-white p-3">
              <ListenButton size="sm" onListen={() => void speak({ line: u.title[lang], lang })} />
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">{u.level}</span>
                <span className="text-lg font-bold">{u.title[lang].label}</span>
              </div>
            </div>
            <ol className="flex flex-col items-center gap-4">
              {u.lessons.map((l, i) => {
                const state = path.availability[l.id];
                const isNext = path.recommended?.lessonId === l.id;
                return (
                  <li key={l.id} className={`flex w-full items-center gap-4 ${i % 2 ? "pl-16" : "pr-16"}`}>
                    <button
                      type="button"
                      data-testid={`path-lesson-${l.id}`}
                      data-state={state}
                      aria-label={`${l.title[lang].label ?? l.title.en}${state === "locked" ? " (locked)" : ""}`}
                      onClick={() => {
                        if (state === "locked") void speak({ line: line("path.locked"), lang });
                        else navigate(`/lesson/${l.id}`);
                      }}
                      className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 text-white ${
                        state === "completed"
                          ? "border-good bg-good"
                          : state === "open"
                            ? `border-primary-dark bg-primary ${isNext ? "pulse-ring" : ""}`
                            : "border-line bg-line text-ink-soft"
                      }`}
                    >
                      {state === "completed" ? <IconCheck size={40} /> : state === "open" ? <IconPlay size={36} /> : <IconLock size={32} />}
                    </button>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-base font-bold leading-tight">{l.title[lang].label}</span>
                      <span className="text-sm text-ink-soft">{l.minutes}′</span>
                      <ReviewMarker status={l.review[lang]} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <Caption line={line("path.intro")} className="sr-only" />
      <BottomNav active="learn" />
    </Screen>
  );
}

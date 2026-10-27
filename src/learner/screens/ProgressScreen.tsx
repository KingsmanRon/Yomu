"use client";

import type { ObjectiveStatus } from "@/lib/learning/types";
import { usePath } from "../progress";
import { useLearner } from "../state";
import { IconCheck, IconFlame, IconRetry, IconShield, IconStar } from "../ui/icons";
import { BottomNav, Caption, ListenButton, Picture, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeakOnMount, useSpeech } from "../ui/speech";

const STATUS_STYLE: Record<ObjectiveStatus, string> = {
  not_started: "border-line bg-white",
  practised: "border-primary-soft bg-primary-soft",
  developing: "border-primary bg-white",
  mastered: "border-good bg-good text-white",
  needs_review: "border-accent bg-accent-soft text-accent",
};

/** Progress and achievements: literacy skills mastered (by lesson), streak, XP, badges, history. */
export function ProgressScreen() {
  const { lang, line, derived, catalog } = useLearner();
  const { speak } = useSpeech();
  const path = usePath();
  useSpeakOnMount(lang ? [{ line: line("progress.intro"), lang }] : null, [lang]);
  if (!lang || !derived || !catalog || !path) return <Spinner />;

  const history = Object.entries(derived.lessons)
    .filter(([, l]) => l.lastCompletedAt)
    .sort(([, a], [, b]) => (b.lastCompletedAt ?? "").localeCompare(a.lastCompletedAt ?? ""))
    .slice(0, 10);

  return (
    <Screen label="progress">
      <TopBar onListen={() => void speak({ line: line("progress.intro"), lang })} />
      <Caption line={line("progress.intro")} />

      <div className="my-4 grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center rounded-2xl bg-white p-3">
          <IconFlame size={32} className="text-accent" />
          <span className="text-2xl font-extrabold" data-testid="progress-streak">
            {derived.streak.current}
          </span>
          <span className="flex">
            {Array.from({ length: derived.streak.graceRemaining }, (_, i) => (
              <IconShield key={i} size={16} className="text-primary" />
            ))}
          </span>
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-white p-3">
          <IconStar size={32} className="text-[#d97706]" />
          <span className="text-2xl font-extrabold" data-testid="progress-xp">
            {derived.xp}
          </span>
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-white p-3">
          <IconCheck size={32} className="text-good" />
          <span className="text-2xl font-extrabold" data-testid="progress-mastered">
            {Object.values(derived.objectives).filter((o) => o.status === "mastered").length}
          </span>
        </div>
      </div>

      <h2 className="sr-only">Badges</h2>
      <div className="grid grid-cols-4 gap-3" data-testid="badges">
        {catalog.badges.map((b) => {
          const earned = !!derived.badges[b.id];
          return (
            <button
              key={b.id}
              type="button"
              data-testid={`badge-${b.id}`}
              data-earned={earned}
              aria-label={`${b.title.en}${earned ? "" : " (not yet)"}`}
              onClick={() => void speak({ line: b.title[lang], lang })}
              className={`flex aspect-square items-center justify-center rounded-2xl bg-white p-1 ${earned ? "" : "opacity-30 grayscale"}`}
            >
              <Picture src={b.icon} className="h-full w-full" />
            </button>
          );
        })}
      </div>

      <h2 className="sr-only">Skills</h2>
      <div className="mt-6 flex flex-col gap-3">
        {path.lessons
          .filter((l) => l.objectives.some((o) => derived.objectives[o.id]?.status && derived.objectives[o.id].status !== "not_started"))
          .map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-2xl bg-white p-3" data-testid={`skills-${l.id}`}>
              <ListenButton size="sm" onListen={() => void speak({ line: l.title[lang], lang })} />
              <span className="flex-1 text-base font-semibold">{l.title[lang].label}</span>
              <span className="flex gap-1">
                {l.objectives.map((o) => {
                  const status = derived.objectives[o.id]?.status ?? "not_started";
                  return (
                    <span
                      key={o.id}
                      title={`${o.description} (${status})`}
                      data-status={status}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-4 ${STATUS_STYLE[status]}`}
                    >
                      {status === "mastered" && <IconCheck size={16} />}
                      {status === "needs_review" && <IconRetry size={16} />}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
      </div>

      {history.length > 0 && (
        <ol className="mt-6 flex flex-col gap-2" data-testid="history">
          {history.map(([id, l]) => {
            const info = catalog.lessons.find((x) => x.id === id);
            return (
              <li key={id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                <span className="font-semibold">{info?.title[lang].label ?? id}</span>
                <span className="text-ink-soft">{l.lastCompletedAt?.slice(0, 10)}</span>
              </li>
            );
          })}
        </ol>
      )}
      <BottomNav active="progress" />
    </Screen>
  );
}

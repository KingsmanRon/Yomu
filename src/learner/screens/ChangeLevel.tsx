"use client";

import { navigate } from "../router";
import { useLearner } from "../state";
import { IconCheck } from "../ui/icons";
import { Caption, ListenButton, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeakOnMount, useSpeech } from "../ui/speech";

/** Choose where to learn from, at any time. Earlier levels always stay open. */
export function ChangeLevel() {
  const { lang, line, catalog, derived, record } = useLearner();
  const { speak } = useSpeech();
  useSpeakOnMount(lang ? [{ line: line("me.level"), lang }] : null, [lang]);
  if (!lang || !catalog || !derived) return <Spinner />;
  const levels = catalog.levels.filter((lv) => catalog.lessons.some((l) => l.level === lv.level && l.available[lang]));

  return (
    <Screen label="change level">
      <TopBar onBack={() => navigate("/me")} onListen={() => void speak({ line: line("me.level"), lang })} />
      <Caption line={line("me.level")} />
      <ul className="mt-4 flex flex-col gap-3">
        {levels.map((lv) => {
          const unit = catalog.units.find((u) => u.level === lv.level);
          const current = derived.level.current === lv.level;
          return (
            <li key={lv.level} className="flex items-center gap-3">
              <ListenButton size="sm" onListen={() => unit && void speak({ line: unit.title[lang], lang })} />
              <button
                type="button"
                data-testid={`level-${lv.level}`}
                aria-pressed={current}
                onClick={async () => {
                  await record("level_change", { level: lv.level, reason: "learner" });
                  await speak({ line: line(`place.level${Math.min(lv.level, 4)}`), lang });
                  navigate("/home");
                }}
                className={`flex min-h-16 flex-1 items-center gap-3 rounded-2xl border-4 px-4 text-left ${current ? "border-primary bg-primary-soft" : "border-line bg-white"}`}
              >
                <span className="text-2xl font-extrabold text-primary">{lv.level}</span>
                <span className="flex-1 text-lg font-semibold">{unit?.title[lang].label}</span>
                {current && <IconCheck size={28} className="text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

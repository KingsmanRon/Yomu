"use client";

import { useEffect, useState } from "react";
import { LANGUAGE_CONFIG, TEACHING_LANGUAGES, type TeachingLanguage } from "@/config/app";
import type { CompiledLine } from "@/lib/content/compiled";
import { player } from "../../audio/player";
import { loadAppLines } from "../../content";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconListen } from "../../ui/icons";
import { AudioNotice, Screen } from "../../ui/kit";
import { usePlaying } from "../../ui/speech";

/**
 * Two large choices. Each one introduces itself in its own language, so a
 * learner can listen to both before choosing, without reading anything.
 */
export function LanguageSelect() {
  const { setLang } = useLearner();
  const [intros, setIntros] = useState<Partial<Record<TeachingLanguage, CompiledLine>>>({});
  const playing = usePlaying();

  useEffect(() => {
    let cancelled = false;
    Promise.all(TEACHING_LANGUAGES.map((l) => loadAppLines(l))).then((all) => {
      if (cancelled) return;
      const next: Partial<Record<TeachingLanguage, CompiledLine>> = {};
      all.forEach((lines, i) => (next[TEACHING_LANGUAGES[i]] = lines.lines["welcome.choose_language"]));
      setIntros(next);
      // Introduce both, one after the other.
      void player.sequence(
        TEACHING_LANGUAGES.map((l) => ({ audio: next[l]?.audio, expect: l, key: next[l]?.id })),
        600,
      );
    });
    return () => {
      cancelled = true;
      player.stop();
    };
  }, []);

  const choose = (lang: TeachingLanguage) => {
    player.stop();
    setLang(lang);
    navigate("/hello");
  };

  return (
    <Screen label="choose language" className="justify-center gap-6 py-8">
      {TEACHING_LANGUAGES.map((lang) => {
        const intro = intros[lang];
        const active = intro && playing === intro.id;
        return (
          <div
            key={lang}
            lang={LANGUAGE_CONFIG[lang].bcp47}
            className={`flex items-stretch gap-3 rounded-3xl border-4 bg-white p-3 transition ${active ? "border-primary shadow-lg" : "border-line"}`}
          >
            <button
              type="button"
              data-testid={`listen-${lang}`}
              aria-label={`${LANGUAGE_CONFIG[lang].nativeName}: listen`}
              onClick={() => void player.play({ audio: intro?.audio, expect: lang, key: intro?.id })}
              className={`flex w-24 shrink-0 items-center justify-center rounded-2xl ${active ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}
            >
              <IconListen size={48} />
            </button>
            <button
              type="button"
              data-testid={`choose-${lang}`}
              onClick={() => choose(lang)}
              className="flex min-h-32 flex-1 flex-col items-start justify-center gap-1 rounded-2xl bg-primary px-5 py-4 text-left text-white shadow-[0_5px_0_0_var(--color-primary-dark)] active:translate-y-1 active:shadow-none"
            >
              <span className="text-3xl font-extrabold">{LANGUAGE_CONFIG[lang].nativeName}</span>
              {intro && <span className="text-base font-medium opacity-90">{intro.text}</span>}
            </button>
          </div>
        );
      })}
      <div className="flex justify-center gap-2">
        {TEACHING_LANGUAGES.map((l) => (
          <AudioNotice key={l} line={intros[l]} />
        )).slice(0, 1)}
      </div>
    </Screen>
  );
}

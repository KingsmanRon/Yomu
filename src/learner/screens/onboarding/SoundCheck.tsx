"use client";

import { useState } from "react";
import { playSoundCheckTone } from "../../audio/player";
import { setMeta } from "../../offline/db";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconCheck, IconListen, IconPlay, IconRetry } from "../../ui/icons";
import { Screen } from "../../ui/kit";

/**
 * Sound check before anything else. No language has been chosen yet, so the
 * screen uses only a tone, pictures and a moving speaker. The first tap also
 * unlocks audio playback in the browser for the rest of onboarding.
 */
export function SoundCheck() {
  const { db } = useLearner();
  const [state, setState] = useState<"idle" | "playing" | "played">("idle");

  const play = async () => {
    setState("playing");
    await playSoundCheckTone();
    setState("played");
  };

  return (
    <Screen label="sound check" className="items-center justify-center gap-10 text-center">
      <div className={`flex h-48 w-48 items-center justify-center rounded-full bg-primary-soft text-primary ${state === "playing" ? "pulse-ring" : ""}`}>
        <IconListen size={120} />
      </div>
      {/* Phone volume buttons, so learners know where to turn the sound up. */}
      <div className="flex items-center gap-3 text-ink-soft" aria-hidden="true">
        <svg width="64" height="96" viewBox="0 0 64 96">
          <rect x="8" y="4" width="44" height="88" rx="8" fill="none" stroke="currentColor" strokeWidth="4" />
          <rect x="52" y="22" width="8" height="14" rx="3" fill="var(--color-accent)" />
          <rect x="52" y="42" width="8" height="14" rx="3" fill="var(--color-accent)" />
          <path d="M60 24 l6 -6 M60 54 l6 6" stroke="var(--color-accent)" strokeWidth="3" />
        </svg>
      </div>
      {state !== "played" ? (
        <button
          type="button"
          data-testid="sound-check-play"
          aria-label="play sound"
          onClick={play}
          disabled={state === "playing"}
          className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_0_0_var(--color-primary-dark)] active:translate-y-1 active:shadow-none disabled:opacity-60"
        >
          <IconPlay size={56} />
        </button>
      ) : (
        <div className="flex w-full items-center justify-center gap-6">
          <button
            type="button"
            data-testid="sound-check-replay"
            aria-label="play again"
            onClick={play}
            className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-line bg-white text-ink"
          >
            <IconRetry size={44} />
          </button>
          <button
            type="button"
            data-testid="sound-check-ok"
            aria-label="I can hear it"
            onClick={async () => {
              if (db) await setMeta(db, "soundChecked", true);
              navigate("/language");
            }}
            className="flex h-28 w-28 items-center justify-center rounded-full bg-good text-white shadow-[0_6px_0_0_#14532d] active:translate-y-1 active:shadow-none"
          >
            <IconCheck size={60} />
          </button>
        </div>
      )}
    </Screen>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CompiledExercise, CompiledLex, Lang } from "@/lib/content/compiled";
import { useLearner } from "../state";
import { IconCheck, IconClose, IconListen, IconSlow } from "../ui/icons";
import { Picture, SpeakButton } from "../ui/kit";
import { useSpeech, type Speakable } from "../ui/speech";
import type { ExercisePhase } from "./types";

/** Speak the instruction (and, for listening tasks, the target) when the exercise opens, and register it for "listen again". */
export function useExerciseIntro(
  ex: CompiledExercise,
  lang: Lang,
  extra: Speakable[],
  setReplay: (fn: () => void) => void,
  phase: ExercisePhase,
) {
  const { speak } = useSpeech();
  useEffect(() => {
    const run = () => void speak({ line: ex.instruction, lang }, ...extra);
    setReplay(run);
    if (phase === "answering") {
      const t = setTimeout(run, 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.id]);
}

/**
 * Clear the learner's answer when the exercise moves to its second attempt.
 * This adjusts state while rendering (React's pattern for reacting to a prop
 * change), so the cleared answer shows in the same render as the retry.
 */
export function useOnRetry(phase: ExercisePhase, reset: () => void) {
  const [previous, setPrevious] = useState(phase);
  if (previous !== phase) {
    setPrevious(phase);
    if (phase === "retry") reset();
  }
}

export function lexAudio(l: CompiledLex | undefined, rate?: number): Speakable {
  return { audio: l?.audio, lang: l?.lang ?? "en", rate };
}

/** Big "listen" and "listen slowly" buttons for the target of a listening task. */
export function TargetAudio({ lex, extraBefore }: { lex: CompiledLex | undefined; extraBefore?: Speakable[] }) {
  const { speak } = useSpeech();
  const { line } = useLearner();
  return (
    <div className="flex items-center justify-center gap-4 py-2">
      <button
        type="button"
        data-testid="target-listen"
        aria-label={line("ui.listen_again")?.label ?? "listen"}
        onClick={() => void speak(...(extraBefore ?? []), lexAudio(lex))}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-white shadow-[0_5px_0_0_var(--color-primary-dark)] active:translate-y-1 active:shadow-none"
      >
        <IconListen size={52} />
      </button>
      <button
        type="button"
        data-testid="target-slow"
        aria-label={line("ui.listen_slow")?.label ?? "listen slowly"}
        onClick={() => void speak(...(extraBefore ?? []), lexAudio(lex, 0.7))}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <IconSlow size={36} />
      </button>
    </div>
  );
}

export type OptionState = "idle" | "selected" | "correct" | "wrong" | "reveal" | "dim";

const OPTION_CLASS: Record<OptionState, string> = {
  idle: "border-line bg-white",
  selected: "border-primary bg-primary-soft",
  correct: "border-good bg-good-soft",
  wrong: "border-retry bg-retry-soft",
  reveal: "border-good border-dashed bg-good-soft",
  dim: "border-line bg-white opacity-50",
};

/** Feedback never relies on colour alone: every state also has an icon. */
export function OptionBadge({ state }: { state: OptionState }) {
  if (state === "correct" || state === "reveal")
    return (
      <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-good text-white" aria-hidden="true">
        <IconCheck size={22} />
      </span>
    );
  if (state === "wrong")
    return (
      <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-retry text-white" aria-hidden="true">
        <IconClose size={22} />
      </span>
    );
  return null;
}

export function OptionButton({
  state,
  onSelect,
  children,
  label,
  testId,
  disabled,
  className = "",
}: {
  state: OptionState;
  onSelect: () => void;
  children: ReactNode;
  label?: string;
  testId?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-state={state}
      aria-label={label}
      aria-pressed={state === "selected"}
      disabled={disabled}
      onClick={onSelect}
      className={`relative flex items-center justify-center rounded-3xl border-4 p-2 transition active:scale-[0.98] ${OPTION_CLASS[state]} ${className}`}
    >
      {children}
      <OptionBadge state={state} />
    </button>
  );
}

/** State of option `id` given the selection and the exercise phase. */
export function optionState(id: string, selected: string | null, answer: string, phase: ExercisePhase, lastWrong: string | null): OptionState {
  if (phase === "correct") return id === answer ? "correct" : "dim";
  if (phase === "revealed") return id === answer ? "reveal" : id === lastWrong ? "wrong" : "dim";
  if (phase === "retry" && id === lastWrong && selected === null) return "wrong";
  return id === selected ? "selected" : "idle";
}

export function PictureFrame({ src, size = "md" }: { src: string | undefined; size?: "md" | "lg" }) {
  return <Picture src={src} className={size === "lg" ? "h-44 w-44" : "h-28 w-28"} />;
}

/** The text a learner reads. Larger and spaced for new readers. */
export function ReadingText({ children, testId, size = "xl" }: { children: ReactNode; testId?: string; size?: "xl" | "lg" | "md" }) {
  const cls = size === "xl" ? "text-5xl" : size === "lg" ? "text-3xl" : "text-2xl";
  return (
    <p data-testid={testId} lang="en" className={`reading-text whitespace-pre-line text-center font-bold leading-snug ${cls}`}>
      {children}
    </p>
  );
}

export function CheckButton({ disabled, onCheck }: { disabled: boolean; onCheck: () => void }) {
  const { line } = useLearner();
  return (
    <SpeakButton testId="check" speech={line("ui.check")} disabled={disabled} onClick={onCheck} className="w-full">
      <IconCheck size={32} />
      <span>{line("ui.check")?.label}</span>
    </SpeakButton>
  );
}

/** Tap-to-place tiles (no dragging needed). Placed tiles can be tapped to return them. */
export function Tiles({
  tiles,
  placed,
  onPlace,
  onRemove,
  disabled,
  words,
}: {
  tiles: string[];
  /** Indices into `tiles`, in answer order. */
  placed: number[];
  onPlace: (i: number) => void;
  onRemove: (pos: number) => void;
  disabled: boolean;
  words?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div
        data-testid="answer-slots"
        className={`flex min-h-24 flex-wrap items-center justify-center gap-2 rounded-3xl border-4 border-dashed p-3 ${placed.length ? "border-primary" : "border-line"}`}
      >
        {placed.map((ti, pos) => (
          <button
            key={`${ti}-${pos}`}
            type="button"
            data-testid="placed-tile"
            disabled={disabled}
            onClick={() => onRemove(pos)}
            lang="en"
            className={`reading-text min-h-16 min-w-16 rounded-2xl border-4 border-primary bg-white px-3 font-bold ${words ? "text-2xl" : "text-4xl"}`}
          >
            {tiles[ti]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {tiles.map((t, i) => {
          const used = placed.includes(i);
          return (
            <button
              key={i}
              type="button"
              data-testid="tile"
              disabled={disabled || used}
              onClick={() => onPlace(i)}
              lang="en"
              className={`reading-text min-h-16 min-w-16 rounded-2xl border-4 px-3 font-bold transition ${words ? "text-2xl" : "text-4xl"} ${used ? "border-line bg-line text-transparent" : "border-line bg-white shadow-[0_3px_0_0_var(--color-line)]"}`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

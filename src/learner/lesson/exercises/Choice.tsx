"use client";

import { useState } from "react";
import type { CompiledExercise } from "@/lib/content/compiled";
import { IconListen } from "../../ui/icons";
import { Picture } from "../../ui/kit";
import { useSpeech } from "../../ui/speech";
import { gradeLetterChoice, gradePair, gradeWordChoice } from "../grading";
import { CheckButton, lexAudio, OptionButton, optionState, ReadingText, TargetAudio, useExerciseIntro, useOnRetry } from "../parts";
import type { ExercisePhase, ExerciseProps } from "../types";

type LetterSound = Extract<CompiledExercise, { type: "letter_sound" }>;
type PictureMatch = Extract<CompiledExercise, { type: "picture_match" }>;
type MinimalPair = Extract<CompiledExercise, { type: "minimal_pair" }>;

function useChoice(phase: ExercisePhase) {
  const [selected, setSelected] = useState<string | null>(null);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  useOnRetry(phase, () => setSelected(null));
  return { selected, setSelected, lastWrong, setLastWrong };
}

/** Letter and sound recognition: hear a sound and find the letter, or see a letter and find its sound. */
export function LetterSoundEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<LetterSound>) {
  const { speak } = useSpeech();
  const { selected, setSelected, lastWrong, setLastWrong } = useChoice(phase);
  const target = lex[ex.target];
  const heard = ex.mode === "sound_to_letter" ? target : ex.mode === "hear_in_word" ? lex[ex.prompt ?? ex.target] : undefined;
  useExerciseIntro(ex, lang, heard ? [lexAudio(heard)] : [], setReplay, phase);
  const done = phase === "correct" || phase === "revealed";

  const check = () => {
    if (!selected) return;
    const g = gradeLetterChoice(target, lex[selected]);
    if (!g.correct) setLastWrong(selected);
    onAnswer({ ...g, itemId: target.id });
  };

  if (ex.mode === "letter_to_sound") {
    // Reading: the written letter or word is shown with no audio; the options are sounds.
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-3xl bg-white p-6">
          <ReadingText testId="read-target">{target.text}</ReadingText>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {ex.options.map((o, i) => (
            <OptionButton
              key={o}
              testId="option"
              label={`sound ${i + 1}`}
              state={optionState(o, selected, ex.target, phase, lastWrong)}
              disabled={done}
              onSelect={() => {
                setSelected(o);
                void speak(lexAudio(lex[o]));
              }}
              className="min-h-28 flex-col gap-1"
            >
              <IconListen size={40} className="text-primary" />
              <span className="text-xl font-bold text-ink-soft">{i + 1}</span>
            </OptionButton>
          ))}
        </div>
        {!done && <CheckButton disabled={!selected} onCheck={check} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TargetAudio lex={heard} />
      <div className="grid grid-cols-3 gap-3">
        {ex.options.map((o) => (
          <OptionButton
            key={o}
            testId="option"
            state={optionState(o, selected, ex.target, phase, lastWrong)}
            disabled={done}
            onSelect={() => setSelected(o)}
            className="min-h-28"
          >
            <span lang={lex[o]?.lang} className="reading-text text-5xl font-bold">
              {lex[o]?.text}
            </span>
          </OptionButton>
        ))}
      </div>
      {!done && <CheckButton disabled={!selected} onCheck={check} />}
    </div>
  );
}

/** Picture-to-word matching in three directions (read, listen, name). */
export function PictureMatchEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<PictureMatch>) {
  const { selected, setSelected, lastWrong, setLastWrong } = useChoice(phase);
  const target = lex[ex.target];
  useExerciseIntro(ex, lang, ex.mode === "listen" ? [lexAudio(target)] : [], setReplay, phase);
  const done = phase === "correct" || phase === "revealed";
  const check = () => {
    if (!selected) return;
    const g = gradeWordChoice(target, lex[selected], ex.mode);
    if (!g.correct) setLastWrong(selected);
    onAnswer({ ...g, itemId: target.id });
  };
  const sentence = target.kind === "sentence";

  return (
    <div className="flex flex-col gap-5">
      {ex.mode === "read" && (
        <div className="rounded-3xl bg-white p-5">
          <ReadingText testId="read-target" size={sentence ? "lg" : "xl"}>
            {target.text}
          </ReadingText>
        </div>
      )}
      {ex.mode === "listen" && <TargetAudio lex={target} />}
      {ex.mode === "name" && (
        <div className="flex justify-center rounded-3xl bg-white p-3">
          <Picture src={target.image} className="h-44 w-44" />
        </div>
      )}
      <div className={`grid gap-3 ${ex.options.length === 2 ? "grid-cols-2" : ex.mode === "name" ? "grid-cols-1" : "grid-cols-2"}`}>
        {ex.options.map((o, i) => (
          <OptionButton
            key={o}
            testId="option"
            label={ex.mode === "name" ? undefined : `picture ${i + 1}`}
            state={optionState(o, selected, ex.target, phase, lastWrong)}
            disabled={done}
            onSelect={() => setSelected(o)}
            className={ex.mode === "name" ? "min-h-20" : "aspect-square"}
          >
            {ex.mode === "name" ? (
              <span lang={lex[o]?.lang} className="reading-text text-4xl font-bold">
                {lex[o]?.text}
              </span>
            ) : (
              <Picture src={lex[o]?.image} className="h-full max-h-40 w-full" />
            )}
          </OptionButton>
        ))}
      </div>
      {!done && <CheckButton disabled={!selected} onCheck={check} />}
    </div>
  );
}

/** Sound discrimination with minimal pairs: which word was it, or same / different. */
export function MinimalPairEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<MinimalPair>) {
  const { speak } = useSpeech();
  const { selected, setSelected, lastWrong, setLastWrong } = useChoice(phase);
  const [a, b] = ex.pair.map((id) => lex[id]);
  const heard = ex.mode === "which_word" ? [lexAudio(lex[ex.target!])] : [lexAudio(a), lexAudio(b)];
  useExerciseIntro(ex, lang, heard, setReplay, phase);
  const done = phase === "correct" || phase === "revealed";

  if (ex.mode === "same_different") {
    const answer = ex.same ? "same" : "different";
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-center gap-6">
          <button type="button" data-testid="pair-a" aria-label="sound 1" onClick={() => void speak(lexAudio(a))} className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-primary-soft text-primary">
            <IconListen size={36} />
            <span className="font-bold">1</span>
          </button>
          <button type="button" data-testid="pair-b" aria-label="sound 2" onClick={() => void speak(lexAudio(b))} className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-primary-soft text-primary">
            <IconListen size={36} />
            <span className="font-bold">2</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["same", "different"] as const).map((o) => (
            <OptionButton
              key={o}
              testId={`option-${o}`}
              label={o}
              state={optionState(o, selected, answer, phase, lastWrong)}
              disabled={done}
              onSelect={() => setSelected(o)}
              className="min-h-28"
            >
              <span className="text-6xl font-bold" aria-hidden="true">
                {o === "same" ? "=" : "≠"}
              </span>
            </OptionButton>
          ))}
        </div>
        {!done && (
          <CheckButton
            disabled={!selected}
            onCheck={() => {
              const correct = selected === answer;
              if (!correct) setLastWrong(selected);
              onAnswer({ correct, errorType: correct ? undefined : "same_different", itemId: ex.pair[0] });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TargetAudio lex={lex[ex.target!]} />
      <div className="grid grid-cols-2 gap-3">
        {ex.pair.map((o) => (
          <OptionButton key={o} testId="option" state={optionState(o, selected, ex.target!, phase, lastWrong)} disabled={done} onSelect={() => setSelected(o)} className="min-h-28">
            <span lang="en" className="reading-text text-5xl font-bold">
              {lex[o]?.text}
            </span>
          </OptionButton>
        ))}
      </div>
      {!done && (
        <CheckButton
          disabled={!selected}
          onCheck={() => {
            if (!selected) return;
            const g = gradePair(lex[ex.target!], lex[selected]);
            if (!g.correct) setLastWrong(selected);
            onAnswer({ ...g, itemId: ex.target });
          }}
        />
      )}
    </div>
  );
}

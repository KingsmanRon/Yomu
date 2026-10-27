"use client";

import { useEffect, useRef, useState } from "react";
import type { CompiledExercise } from "@/lib/content/compiled";
import { IconKeyboard } from "../../ui/icons";
import { ListenButton, Picture } from "../../ui/kit";
import { useSpeech } from "../../ui/speech";
import { gradeTyping } from "../grading";
import { CheckButton, lexAudio, ReadingText, TargetAudio, useExerciseIntro, useOnRetry } from "../parts";
import type { ExerciseProps } from "../types";

type Typing = Extract<CompiledExercise, { type: "typing" }>;

/**
 * Typing practice on the phone's own keyboard: the skill needed to send an
 * SMS or fill in an online form. Case, spaces and punctuation are forgiven;
 * spelling is what is practised.
 */
export function TypingEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<Typing>) {
  const { speak } = useSpeech();
  const target = lex[ex.target];
  const passage = ex.passage ? lex[ex.passage] : undefined;
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const intro = ex.mode === "listen" ? [lexAudio(target)] : ex.mode === "answer" && ex.question ? [{ line: ex.question, lang }] : [];
  useExerciseIntro(ex, lang, intro, setReplay, phase);
  useOnRetry(phase, () => setValue(""));
  useEffect(() => {
    if (phase === "retry") input.current?.focus();
  }, [phase]);
  const done = phase === "correct" || phase === "revealed";

  return (
    <div className="flex flex-col gap-4">
      {ex.mode === "listen" && <TargetAudio lex={target} />}
      {ex.mode === "copy" && (
        <div className="rounded-3xl bg-white p-4">
          <ReadingText testId="copy-target">{target.text}</ReadingText>
        </div>
      )}
      {ex.mode === "picture" && (
        <div className="flex justify-center rounded-3xl bg-white p-3">
          <Picture src={target.image} className="h-40 w-40" />
        </div>
      )}
      {ex.mode === "answer" && (
        <>
          {passage && (
            <div className="rounded-3xl border-2 border-line bg-white p-4" data-testid="passage">
              <ReadingText size="md">{passage.text}</ReadingText>
            </div>
          )}
          {ex.question && (
            <div className="flex items-center gap-3 rounded-2xl bg-accent-soft p-3">
              <ListenButton size="sm" testId="question-listen" onListen={() => void speak({ line: ex.question, lang })} />
              <p className="text-lg font-semibold">{ex.question.text}</p>
            </div>
          )}
        </>
      )}
      {phase === "revealed" && (
        <div className="rounded-3xl bg-good-soft p-3" data-testid="revealed-answer">
          <ReadingText>{target.text}</ReadingText>
        </div>
      )}
      <label className="flex items-center gap-3 rounded-2xl border-4 border-primary bg-white px-4">
        <IconKeyboard size={32} className="text-primary" />
        <span className="sr-only">type here</span>
        <input
          ref={input}
          data-testid="typing-input"
          value={value}
          disabled={done}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onAnswer({ ...gradeTyping(target.text, value), itemId: target.id });
          }}
          lang="en"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          className="reading-text min-h-16 w-full bg-transparent text-3xl font-bold outline-none"
        />
      </label>
      {!done && <CheckButton disabled={!value.trim()} onCheck={() => onAnswer({ ...gradeTyping(target.text, value), itemId: target.id })} />}
    </div>
  );
}

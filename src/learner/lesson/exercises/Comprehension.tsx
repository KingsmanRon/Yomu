"use client";

import { useState } from "react";
import type { CompiledExercise, CompiledLine, CompiledOption, Lang } from "@/lib/content/compiled";
import { ListenButton, Picture } from "../../ui/kit";
import { useSpeech } from "../../ui/speech";
import { CheckButton, lexAudio, OptionButton, optionState, ReadingText, TargetAudio, useExerciseIntro, useOnRetry } from "../parts";
import type { ExerciseProps, ExercisePhase } from "../types";

type Listening = Extract<CompiledExercise, { type: "listening_comprehension" }>;
type Reading = Extract<CompiledExercise, { type: "reading_comprehension" }>;
type RealWorld = Extract<CompiledExercise, { type: "real_world" }>;

/** A question asked aloud in the teaching language, with answer options (pictures and/or English words). */
function QuestionAndOptions({
  question,
  options,
  answer,
  lang,
  phase,
  onAnswer,
  itemId,
}: {
  question: CompiledLine;
  options: CompiledOption[];
  answer: string;
  lang: Lang;
  phase: ExercisePhase;
  onAnswer: (r: { correct: boolean; errorType?: "detail"; itemId?: string }) => void;
  itemId: string;
}) {
  const { speak } = useSpeech();
  const [selected, setSelected] = useState<string | null>(null);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  useOnRetry(phase, () => setSelected(null));
  const done = phase === "correct" || phase === "revealed";
  const textOnly = options.every((o) => !o.image);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-accent-soft p-3">
        <ListenButton size="sm" testId="question-listen" onListen={() => void speak({ line: question, lang })} />
        <p className="text-lg font-semibold">{question.text}</p>
      </div>
      <div className={`grid gap-3 ${textOnly ? "grid-cols-1" : options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((o, i) => (
          <OptionButton
            key={o.id}
            testId="option"
            label={o.text ?? `picture ${i + 1}`}
            state={optionState(o.id, selected, answer, phase, lastWrong)}
            disabled={done}
            onSelect={() => setSelected(o.id)}
            className={textOnly ? "min-h-16" : "aspect-square flex-col gap-1"}
          >
            {o.image && <Picture src={o.image} className={o.text ? "h-3/4 w-3/4" : "h-full w-full"} />}
            {o.text && (
              <span lang="en" className={`reading-text font-bold ${textOnly ? "text-3xl" : "text-lg"}`}>
                {o.text}
              </span>
            )}
          </OptionButton>
        ))}
      </div>
      {!done && (
        <CheckButton
          disabled={!selected}
          onCheck={() => {
            const correct = selected === answer;
            if (!correct) setLastWrong(selected);
            onAnswer({ correct, errorType: correct ? undefined : "detail", itemId });
          }}
        />
      )}
    </div>
  );
}

/** Listening comprehension: hear an English sentence, answer a question asked in the teaching language. */
export function ListeningEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<Listening>) {
  const audio = lex[ex.audio];
  useExerciseIntro(ex, lang, [lexAudio(audio), { line: ex.question, lang }], setReplay, phase);
  return (
    <div className="flex flex-col gap-4">
      <TargetAudio lex={audio} />
      <QuestionAndOptions question={ex.question} options={ex.options} answer={ex.answer} lang={lang} phase={phase} onAnswer={onAnswer} itemId={audio.id} />
    </div>
  );
}

/** Reading comprehension: read a sentence or passage (no audio), answer a spoken question. */
export function ReadingEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<Reading>) {
  const passage = lex[ex.passage];
  useExerciseIntro(ex, lang, [{ line: ex.question, lang }], setReplay, phase);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border-2 border-line bg-white p-4" data-testid="passage">
        <ReadingText size={passage.kind === "passage" ? "md" : "lg"}>{passage.text}</ReadingText>
      </div>
      <QuestionAndOptions question={ex.question} options={ex.options} answer={ex.answer} lang={lang} phase={phase} onAnswer={onAnswer} itemId={passage.id} />
    </div>
  );
}

/** Real-world reading: an SMS on a phone screen, a sign, or a form. */
export function RealWorldEx({ ex, lang, phase, onAnswer, setReplay }: ExerciseProps<RealWorld>) {
  useExerciseIntro(ex, lang, [{ line: ex.question, lang }], setReplay, phase);
  const s = ex.scenario;
  return (
    <div className="flex flex-col gap-4">
      {s.kind === "sms" && (
        <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-ink bg-[#f1f5f9] p-3" data-testid="sms-screen">
          <div className="mb-2 flex items-center justify-between px-1 text-sm font-bold text-ink-soft">
            <span lang="en">{s.sender}</span>
            <span>{s.time}</span>
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
            <p lang="en" className="reading-text text-2xl font-semibold leading-snug">
              {s.body}
            </p>
          </div>
        </div>
      )}
      {s.kind === "sign" && (
        <div className="mx-auto flex min-h-32 w-full max-w-sm items-center justify-center rounded-xl border-8 border-white bg-[#1e3a5f] p-4 shadow-md" data-testid="sign">
          <span lang="en" className="text-center text-4xl font-extrabold tracking-wider text-white">
            {s.text}
          </span>
        </div>
      )}
      {s.kind === "form" && (
        <div className="rounded-2xl border-2 border-line bg-white p-4" data-testid="form">
          <p lang="en" className="mb-3 text-xl font-bold">
            {s.title}
          </p>
          {s.fields.map((f) => (
            <div key={f.label} className="mb-2 flex items-center gap-3">
              <span lang="en" className="w-32 text-lg font-semibold">
                {f.label}
              </span>
              <span className="min-h-10 flex-1 rounded-lg border-2 border-line px-2 py-1 text-lg">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      <QuestionAndOptions question={ex.question} options={ex.options} answer={ex.answer} lang={lang} phase={phase} onAnswer={onAnswer} itemId={ex.id} />
    </div>
  );
}

"use client";

import { useState } from "react";
import type { CompiledExercise } from "@/lib/content/compiled";
import { useLearner } from "../../state";
import { IconBackspace } from "../../ui/icons";
import { Picture } from "../../ui/kit";
import { gradeSequence } from "../grading";
import { CheckButton, lexAudio, ReadingText, TargetAudio, Tiles, useExerciseIntro, useOnRetry } from "../parts";
import type { ExercisePhase, ExerciseProps } from "../types";

type WordBuild = Extract<CompiledExercise, { type: "word_build" }>;
type SentenceBuild = Extract<CompiledExercise, { type: "sentence_build" }>;

function usePlaced(phase: ExercisePhase) {
  const [placed, setPlaced] = useState<number[]>([]);
  useOnRetry(phase, () => setPlaced([]));
  return { placed, setPlaced };
}

/** Word building with letter (or syllable) tiles. */
export function WordBuildEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<WordBuild>) {
  const { line } = useLearner();
  const target = lex[ex.target];
  const graphemes = target.graphemes ?? [...target.text];
  const { placed, setPlaced } = usePlaced(phase);
  useExerciseIntro(ex, lang, ex.mode === "listen" ? [lexAudio(target)] : [], setReplay, phase);
  const done = phase === "correct" || phase === "revealed";

  return (
    <div className="flex flex-col gap-5">
      {ex.mode === "listen" ? (
        <TargetAudio lex={target} />
      ) : (
        <div className="flex justify-center rounded-3xl bg-white p-3">
          <Picture src={target.image} className="h-40 w-40" />
        </div>
      )}
      {phase === "revealed" && (
        <div className="rounded-3xl bg-good-soft p-3" data-testid="revealed-answer">
          <ReadingText>{target.text}</ReadingText>
        </div>
      )}
      <Tiles
        tiles={ex.tiles}
        placed={placed}
        disabled={done}
        onPlace={(i) => setPlaced([...placed, i])}
        onRemove={(pos) => setPlaced(placed.filter((_, k) => k !== pos))}
      />
      {!done && (
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="clear"
            aria-label={line("ui.clear")?.label ?? "clear"}
            disabled={placed.length === 0}
            onClick={() => setPlaced(placed.slice(0, -1))}
            className="flex min-h-14 w-20 items-center justify-center rounded-2xl border-2 border-line bg-white text-ink-soft disabled:opacity-40"
          >
            <IconBackspace size={30} />
          </button>
          <div className="flex-1">
            <CheckButton
              disabled={placed.length === 0}
              onCheck={() => onAnswer({ ...gradeSequence(graphemes, placed.map((i) => ex.tiles[i]), "graphemes"), itemId: target.id })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Sentence construction: put the heard sentence's word tiles in order. */
export function SentenceBuildEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<SentenceBuild>) {
  const target = lex[ex.target];
  const words = target.text.split(/\s+/).filter(Boolean);
  const { placed, setPlaced } = usePlaced(phase);
  useExerciseIntro(ex, lang, [lexAudio(target)], setReplay, phase);
  const done = phase === "correct" || phase === "revealed";

  return (
    <div className="flex flex-col gap-5">
      <TargetAudio lex={target} />
      {phase === "revealed" && (
        <div className="rounded-3xl bg-good-soft p-3" data-testid="revealed-answer">
          <ReadingText size="lg">{target.text}</ReadingText>
        </div>
      )}
      <Tiles
        words
        tiles={ex.tiles}
        placed={placed}
        disabled={done}
        onPlace={(i) => setPlaced([...placed, i])}
        onRemove={(pos) => setPlaced(placed.filter((_, k) => k !== pos))}
      />
      {!done && (
        <CheckButton
          disabled={placed.length === 0}
          onCheck={() => onAnswer({ ...gradeSequence(words, placed.map((i) => ex.tiles[i]), "words"), itemId: target.id })}
        />
      )}
    </div>
  );
}

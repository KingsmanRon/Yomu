"use client";

import { useRef, useState } from "react";
import type { CompiledExercise } from "@/lib/content/compiled";
import { useLearner } from "../../state";
import { IconRetry } from "../../ui/icons";
import { gradeTrace, samplePolyline, type Point } from "../grading";
import { CheckButton, lexAudio, useExerciseIntro, useOnRetry } from "../parts";
import type { ExerciseProps } from "../types";

type Trace = Extract<CompiledExercise, { type: "trace" }>;

/**
 * Letter tracing with touch. The guide shows each stroke as dots, starting at
 * a large green dot with its stroke number. Checking is tolerant: the trace
 * must cover most of the letter and stay near it; speed and small wobbles do
 * not matter.
 */
export function TraceEx({ ex, lex, lang, phase, onAnswer, setReplay }: ExerciseProps<Trace>) {
  const { line } = useLearner();
  const letter = lex[ex.letter];
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const drawing = useRef<Point[] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  useExerciseIntro(ex, lang, [lexAudio(letter)], setReplay, phase);
  useOnRetry(phase, () => setStrokes([]));
  const done = phase === "correct" || phase === "revealed";

  const toPoint = (e: React.PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };

  return (
    <div className="flex flex-col gap-4">
      <svg
        ref={svg}
        data-testid="trace-area"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`trace the letter ${letter.text}`}
        className="mx-auto aspect-square w-full max-w-sm touch-none select-none rounded-3xl border-4 border-line bg-white"
        onPointerDown={(e) => {
          if (done) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drawing.current = [toPoint(e)];
          setStrokes((s) => [...s, drawing.current!]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          drawing.current.push(toPoint(e));
          setStrokes((s) => [...s.slice(0, -1), [...drawing.current!]]);
        }}
        onPointerUp={() => {
          drawing.current = null;
        }}
      >
        {/* Writing lines: x-height between 42 and 88, descender to 99. */}
        <line x1="4" y1="42" x2="96" y2="42" stroke="var(--color-line)" strokeWidth="0.8" strokeDasharray="2 2" />
        <line x1="4" y1="88" x2="96" y2="88" stroke="var(--color-ink-soft)" strokeWidth="0.8" />
        {ex.strokes.map((stroke, si) => (
          <g key={si}>
            {samplePolyline(stroke as Point[], 5).map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="1.6" fill={phase === "revealed" ? "var(--color-good)" : "var(--color-ink-soft)"} opacity="0.55" />
            ))}
            <circle cx={stroke[0][0]} cy={stroke[0][1]} r="4.5" fill="var(--color-good)" />
            <text x={stroke[0][0]} y={stroke[0][1] + 1.8} textAnchor="middle" fontSize="5" fontWeight="bold" fill="white">
              {si + 1}
            </text>
          </g>
        ))}
        {strokes.map((s, i) => (
          <polyline
            key={i}
            points={s.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={phase === "correct" ? "var(--color-good)" : "var(--color-primary)"}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {!done && (
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="trace-clear"
            aria-label={line("ui.clear")?.label ?? "clear"}
            disabled={strokes.length === 0}
            onClick={() => setStrokes([])}
            className="flex min-h-14 w-20 items-center justify-center rounded-2xl border-2 border-line bg-white text-ink-soft disabled:opacity-40"
          >
            <IconRetry size={30} />
          </button>
          <div className="flex-1">
            <CheckButton
              disabled={strokes.length === 0}
              onCheck={() => {
                const g = gradeTrace(ex.strokes as Point[][], strokes);
                onAnswer({ correct: g.correct, errorType: g.errorType, itemId: letter.id });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

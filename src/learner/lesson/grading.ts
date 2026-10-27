import type { CompiledLex } from "@/lib/content/compiled";
import type { ErrorType } from "@/lib/learning/types";

/**
 * Answer checking and error classification for lesson components. Pure
 * functions, so they are unit-tested and behave identically everywhere.
 * The error type chooses the feedback clip ("listen to the middle sound").
 */
export interface Grade {
  correct: boolean;
  errorType?: ErrorType;
}

/** Letters easily confused by shape (mirror images and rotations). */
const SHAPE_GROUPS = [
  ["b", "d", "p", "q"],
  ["m", "w"],
  ["n", "u"],
  ["i", "l", "j"],
];

export function similarShape(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return SHAPE_GROUPS.some((g) => g.includes(x) && g.includes(y));
}

/** Which sound position differs between two words of the same length. */
export function soundPositionError(target: string[], chosen: string[]): ErrorType | undefined {
  if (target.length === 0 || target.length !== chosen.length) return undefined;
  const first = target.findIndex((g, i) => g.toLowerCase() !== chosen[i].toLowerCase());
  if (first < 0) return undefined;
  if (first === 0) return "first_sound";
  if (first === target.length - 1) return "last_sound";
  return "middle_sound";
}

export function gradeLetterChoice(target: CompiledLex, chosen: CompiledLex): Grade {
  if (target.id === chosen.id) return { correct: true };
  if (target.kind === "letter" && chosen.kind === "letter" && similarShape(target.text, chosen.text))
    return { correct: false, errorType: "letter_shape" };
  return { correct: false, errorType: "wrong_choice" };
}

/** Choosing between written words or pictures of words. */
export function gradeWordChoice(target: CompiledLex, chosen: CompiledLex, mode: "read" | "listen" | "name"): Grade {
  if (target.id === chosen.id) return { correct: true };
  if (mode !== "listen" && target.graphemes && chosen.graphemes) {
    const pos = soundPositionError(target.graphemes, chosen.graphemes);
    if (pos) return { correct: false, errorType: pos };
  }
  return { correct: false, errorType: "meaning" };
}

export function gradePair(target: CompiledLex, chosen: CompiledLex): Grade {
  if (target.id === chosen.id) return { correct: true };
  const pos = target.graphemes && chosen.graphemes ? soundPositionError(target.graphemes, chosen.graphemes) : undefined;
  return { correct: false, errorType: pos ?? "middle_sound" };
}

/** Building a word (graphemes) or a sentence (words) from tiles. */
export function gradeSequence(target: string[], built: string[], unit: "graphemes" | "words"): Grade {
  if (target.length === built.length && target.every((t, i) => t === built[i])) return { correct: true };
  if (built.length < target.length) return { correct: false, errorType: "missing_letter" };
  const sorted = (xs: string[]) => [...xs].sort().join("\u0000");
  if (built.length === target.length && sorted(target) === sorted(built)) return { correct: false, errorType: "order" };
  if (unit === "words") return { correct: false, errorType: "order" };
  return { correct: false, errorType: soundPositionError(target, built) ?? "middle_sound" };
}

/**
 * Typed answers: tolerant of case, spaces and punctuation ("ok", "OK.",
 * " Ok " all match "OK"). Spelling must be right: that is what is practised.
 */
export function normaliseTyped(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function gradeTyping(target: string, typed: string): Grade {
  return normaliseTyped(target) === normaliseTyped(typed) && normaliseTyped(typed).length > 0
    ? { correct: true }
    : { correct: false, errorType: "typing_mismatch" };
}

export type Point = [number, number];

/** Points every `step` units along a polyline. */
export function samplePolyline(points: Point[], step = 3): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.floor(len / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

export const TRACE_RULES = { tolerance: 11, minCoverage: 0.8, minOnPath: 0.7 } as const;

/**
 * Tolerant tracing check in the 100x100 letter box. The learner's drawing
 * must cover most of every guide stroke (coverage) and stay mostly near the
 * letter (on-path). Stroke order and speed are not judged.
 */
export function gradeTrace(guide: Point[][], drawn: Point[][], rules = TRACE_RULES): Grade & { coverage: number; onPath: number } {
  const guidePts = guide.flatMap((s) => samplePolyline(s));
  const drawnPts = drawn.flatMap((s) => (s.length > 1 ? samplePolyline(s, 2) : s));
  if (drawnPts.length < 3) return { correct: false, errorType: "trace_off_path", coverage: 0, onPath: 0 };
  const near = (p: Point, set: Point[]) => set.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= rules.tolerance);
  const coverage = guidePts.filter((p) => near(p, drawnPts)).length / guidePts.length;
  const onPath = drawnPts.filter((p) => near(p, guidePts)).length / drawnPts.length;
  const correct = coverage >= rules.minCoverage && onPath >= rules.minOnPath;
  return { correct, errorType: correct ? undefined : "trace_off_path", coverage, onPath };
}

import { describe, expect, it } from "vitest";
import type { CompiledLex } from "@/lib/content/compiled";
import {
  gradeLetterChoice,
  gradePair,
  gradeSequence,
  gradeTrace,
  gradeTyping,
  gradeWordChoice,
  normaliseTyped,
  type Point,
} from "@/learner/lesson/grading";

const lex = (id: string, text: string, graphemes?: string[], kind: CompiledLex["kind"] = "word"): CompiledLex => ({
  id,
  lang: "en",
  kind,
  text,
  audio: null,
  graphemes,
  review: "draft",
});

const cat = lex("en.w.cat", "cat", ["c", "a", "t"]);
const map = lex("en.w.map", "map", ["m", "a", "p"]);
const cot = lex("en.w.cot", "cot", ["c", "o", "t"]);
const can = lex("en.w.can", "can", ["c", "a", "n"]);
const pen = lex("en.w.pen", "pen", ["p", "e", "n"]);
const pan = lex("en.w.pan", "pan", ["p", "a", "n"]);

describe("word choice error classification", () => {
  it("identifies first, middle and last sound errors", () => {
    expect(gradeWordChoice(cat, map, "read")).toEqual({ correct: false, errorType: "first_sound" });
    expect(gradeWordChoice(cat, cot, "read")).toEqual({ correct: false, errorType: "middle_sound" });
    expect(gradeWordChoice(cat, can, "read")).toEqual({ correct: false, errorType: "last_sound" });
    expect(gradeWordChoice(cat, cat, "read")).toEqual({ correct: true });
  });
  it("treats listening mistakes as meaning errors", () => {
    expect(gradeWordChoice(cat, map, "listen")).toEqual({ correct: false, errorType: "meaning" });
  });
  it("classifies minimal pairs by the sound that differs", () => {
    expect(gradePair(pen, pan)).toEqual({ correct: false, errorType: "middle_sound" });
  });
});

describe("letters", () => {
  it("flags letters confused by shape", () => {
    const b = lex("en.l.b", "b", undefined, "letter");
    const d = lex("en.l.d", "d", undefined, "letter");
    const s = lex("en.l.s", "s", undefined, "letter");
    expect(gradeLetterChoice(b, d)).toEqual({ correct: false, errorType: "letter_shape" });
    expect(gradeLetterChoice(b, s)).toEqual({ correct: false, errorType: "wrong_choice" });
  });
});

describe("tiles", () => {
  it("distinguishes order, missing and wrong sounds", () => {
    expect(gradeSequence(["c", "a", "t"], ["c", "a", "t"], "graphemes").correct).toBe(true);
    expect(gradeSequence(["c", "a", "t"], ["a", "c", "t"], "graphemes").errorType).toBe("order");
    expect(gradeSequence(["c", "a", "t"], ["c", "a"], "graphemes").errorType).toBe("missing_letter");
    expect(gradeSequence(["c", "a", "t"], ["k", "a", "t"], "graphemes").errorType).toBe("first_sound");
    expect(gradeSequence(["The", "bus", "is", "here."], ["The", "is", "bus", "here."], "words").errorType).toBe("order");
  });
});

describe("typing", () => {
  it("ignores case, spaces and punctuation but not spelling", () => {
    expect(normaliseTyped(" O.K. ")).toBe("ok");
    expect(gradeTyping("OK", "ok").correct).toBe(true);
    expect(gradeTyping("ID", "i.d.").correct).toBe(true);
    expect(gradeTyping("you", "yuo")).toEqual({ correct: false, errorType: "typing_mismatch" });
    expect(gradeTyping("you", "   ").correct).toBe(false);
  });
});

describe("tracing", () => {
  const t: Point[][] = [
    [
      [50, 14],
      [50, 88],
    ],
    [
      [34, 38],
      [66, 38],
    ],
  ];
  it("accepts a drawing that follows the strokes, with some wobble", () => {
    const drawn: Point[][] = [
      [
        [52, 15],
        [48, 50],
        [51, 87],
      ],
      [
        [33, 40],
        [66, 36],
      ],
    ];
    expect(gradeTrace(t, drawn).correct).toBe(true);
  });
  it("rejects scribbles away from the letter and partial tracing", () => {
    const scribble: Point[][] = [
      [
        [5, 5],
        [95, 95],
      ],
    ];
    expect(gradeTrace(t, scribble)).toMatchObject({ correct: false, errorType: "trace_off_path" });
    const half: Point[][] = [
      [
        [50, 14],
        [50, 50],
      ],
    ];
    expect(gradeTrace(t, half).correct).toBe(false);
  });
});

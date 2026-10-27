import { describe, expect, it } from "vitest";
import type { CompiledExercise, CompiledLex } from "@/lib/content/compiled";
import { evidenceFor } from "@/lib/learning/evidence";
import { helpOptions, helpSequence } from "@/lib/tutor/tier1";

const audio = { src: "/a.ogg", ms: 1000, bytes: 100, placeholder: true, lang: "en" as const };
const cat: CompiledLex = {
  id: "en.w.cat",
  lang: "en",
  kind: "word",
  text: "cat",
  audio,
  gloss: { word: "ikati", line: { id: "zu.gloss.cat", text: "…", audio: { ...audio, lang: "zu" }, review: "draft" } },
  graphemes: ["c", "a", "t"],
  graphemeAudio: [audio, audio, audio],
  review: "draft",
};
const lex = { "en.w.cat": cat };
const line = { id: "x", text: "x", audio: null, review: "draft" as const };
const base = { kind: "exercise" as const, id: "l20.e01", objectives: ["o"], errorTypes: [], instruction: line, feedback: {} };

const readEx = {
  ...base,
  type: "picture_match",
  mode: "read",
  target: "en.w.cat",
  options: ["en.w.cat"],
  evidence: evidenceFor({ type: "picture_match", mode: "read" }),
} as CompiledExercise;
const listenEx = {
  ...base,
  type: "picture_match",
  mode: "listen",
  target: "en.w.cat",
  options: ["en.w.cat"],
  evidence: evidenceFor({ type: "picture_match", mode: "listen" }),
} as CompiledExercise;

describe("Tier 1 tutor clip selection", () => {
  it("in a reading task, marks hearing the word, its sounds or its meaning as revealing", () => {
    const opts = helpOptions(readEx, lex, { spokenQuestions: false });
    expect(opts.find((o) => o.id === "hear")?.reveals).toBe(true);
    expect(opts.find((o) => o.id === "letter")?.reveals).toBe(true);
    expect(opts.find((o) => o.id === "meaning")?.reveals).toBe(true);
    expect(opts.find((o) => o.id === "how")?.reveals).toBe(false);
  });

  it("explains first, and only reveals after the learner confirms", () => {
    expect(helpSequence("hear", readEx, false, true)).toEqual([{ kind: "clip", clipId: "tutor.read_alone_first" }]);
    expect(helpSequence("hear", readEx, true, true)).toEqual([{ kind: "lex", lexId: "en.w.cat", part: "audio" }]);
  });

  it("offers slow replay without penalty in listening tasks", () => {
    const opts = helpOptions(listenEx, lex, { spokenQuestions: false });
    expect(opts.find((o) => o.id === "slow")).toEqual({ id: "slow", reveals: false });
    expect(helpSequence("slow", listenEx, false, false)).toEqual([
      { kind: "clip", clipId: "tutor.listen_slow" },
      { kind: "lex", lexId: "en.w.cat", part: "audio", rate: 0.7 },
    ]);
  });

  it("only offers spoken questions when Tier 2 is available", () => {
    expect(helpOptions(readEx, lex, { spokenQuestions: false }).some((o) => o.id === "ask")).toBe(false);
    expect(helpOptions(readEx, lex, { spokenQuestions: true }).some((o) => o.id === "ask")).toBe(true);
  });
});

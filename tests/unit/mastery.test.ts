import { describe, expect, it } from "vitest";
import { deriveState } from "@/lib/learning/engine";
import { evidenceFor } from "@/lib/learning/evidence";
import { BUILD, LISTEN_PICTURE, META, READ, REPEAT, SOUND_TO_LETTER, WHICH_WORD, attempt } from "./helpers";

const D = "2026-10-01";
const words = ["en.w.cat", "en.w.sit", "en.w.map", "en.w.pen", "en.w.tin", "en.w.man"];

function many(kind: typeof READ, n: number, outcome: "correct" | "incorrect" | "practised" = "correct", extra = {}) {
  return Array.from({ length: n }, (_, i) =>
    attempt(D, i, kind, { objectiveIds: ["obj.read-cvc"], itemId: words[i % words.length], outcome, ...extra }),
  );
}

describe("reading mastery requires independent decoding", () => {
  it("never masters decoding from repeat-only evidence, however much", () => {
    const state = deriveState(many(REPEAT, 40, "practised"), META, D);
    const obj = state.objectives["obj.read-cvc"];
    expect(obj.status).toBe("practised");
    expect(obj.competencies.decode?.status ?? "not_started").toBe("not_started");
    expect(obj.competencies.repeat?.status).toBe("practised");
  });

  it("never masters decoding from recognition-only evidence (hear then choose)", () => {
    const ops = [...many(SOUND_TO_LETTER, 20), ...many(WHICH_WORD, 20), ...many(LISTEN_PICTURE, 20)];
    const state = deriveState(ops, META, D);
    const obj = state.objectives["obj.read-cvc"];
    expect(obj.status).not.toBe("mastered");
    expect(obj.competencies.decode?.status).toBe("not_started");
    expect(obj.competencies.recognise?.status).toBe("mastered");
    expect(obj.competencies.understand_spoken?.status).toBe("mastered");
  });

  it("never masters decoding from tile building alone (half-weight evidence)", () => {
    const state = deriveState(many(BUILD, 30), META, D);
    expect(state.objectives["obj.read-cvc"].competencies.decode?.status).toBe("developing");
    expect(state.objectives["obj.read-cvc"].status).not.toBe("mastered");
  });

  it("does not count attempts where the target word was played first", () => {
    const state = deriveState(many(READ, 10, "correct", { supported: true }), META, D);
    expect(state.objectives["obj.read-cvc"].status).not.toBe("mastered");
  });

  it("does not count retries after feedback", () => {
    const state = deriveState(many(READ, 10, "correct", { attemptNumber: 2 }), META, D);
    expect(state.objectives["obj.read-cvc"].status).not.toBe("mastered");
  });

  it("masters decoding after enough correct independent reading across different words", () => {
    const state = deriveState(many(READ, 3), META, D);
    const obj = state.objectives["obj.read-cvc"];
    expect(obj.status).toBe("mastered");
    expect(obj.firstMasteredAt).toBe("2026-10-01T08:02:00.000Z");
  });

  it("does not master when the same single word is answered repeatedly but other words were missed", () => {
    const ops = [
      attempt(D, 0, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.sit", outcome: "incorrect" }),
      attempt(D, 1, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
      attempt(D, 2, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
      attempt(D, 3, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
    ];
    expect(deriveState(ops, META, D).objectives["obj.read-cvc"].status).toBe("developing");
  });

  it("tile building can support, but full-weight reading is still required", () => {
    const ops = [
      ...many(BUILD, 4),
      attempt(D, 10, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
    ];
    expect(deriveState(ops, META, D).objectives["obj.read-cvc"].status).not.toBe("mastered");
    ops.push(attempt(D, 11, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.map", outcome: "correct" }));
    expect(deriveState(ops, META, D).objectives["obj.read-cvc"].status).toBe("mastered");
  });

  it("marks a mastered objective as needing review after later mistakes, keeping the first mastery date", () => {
    const ops = [
      ...many(READ, 3),
      ...Array.from({ length: 3 }, (_, i) =>
        attempt(D, 30 + i, READ, { objectiveIds: ["obj.read-cvc"], itemId: words[i], outcome: "incorrect" }),
      ),
    ];
    const obj = deriveState(ops, META, D).objectives["obj.read-cvc"];
    expect(obj.status).toBe("needs_review");
    expect(obj.firstMasteredAt).toBe("2026-10-01T08:02:00.000Z");
  });

  it("requires every mastery competency of an objective", () => {
    const passage = (i: number, kind = READ) =>
      attempt(D, i, kind, {
        objectiveIds: ["obj.read-sentence"],
        itemId: `en.sen.s${i % 3}`,
        outcome: "correct",
      });
    // Reading comprehension gives decode + understand_written together.
    const ops = [0, 1, 2].map((i) => passage(i, { type: "reading_comprehension" }));
    expect(deriveState(ops, META, D).objectives["obj.read-sentence"].status).toBe("mastered");
    // Listening comprehension gives neither.
    const listening = [0, 1, 2, 3, 4].map((i) => passage(i, { type: "listening_comprehension" }));
    expect(deriveState(listening, META, D).objectives["obj.read-sentence"].status).toBe("developing");
  });
});

describe("evidence declarations", () => {
  it("only lets text-without-audio tasks give full decoding evidence", () => {
    const full = (k: Parameters<typeof evidenceFor>[0]) =>
      evidenceFor(k).some((e) => e.competency === "decode" && e.weight >= 1);
    expect(full({ type: "picture_match", mode: "read" })).toBe(true);
    expect(full({ type: "picture_match", mode: "name" })).toBe(true);
    expect(full({ type: "letter_sound", mode: "letter_to_sound" })).toBe(true);
    expect(full({ type: "reading_comprehension" })).toBe(true);
    expect(full({ type: "real_world" })).toBe(true);
    expect(full({ type: "picture_match", mode: "listen" })).toBe(false);
    expect(full({ type: "letter_sound", mode: "sound_to_letter" })).toBe(false);
    expect(full({ type: "listen_repeat" })).toBe(false);
    expect(full({ type: "minimal_pair", mode: "which_word" })).toBe(false);
    expect(full({ type: "word_build", mode: "listen" })).toBe(false);
    expect(full({ type: "sentence_build" })).toBe(false);
    expect(full({ type: "listening_comprehension" })).toBe(false);
  });

  it("records listen-and-repeat only as repeat practice", () => {
    expect(evidenceFor({ type: "listen_repeat" })).toEqual([{ competency: "repeat", weight: 1 }]);
  });
});

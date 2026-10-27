import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/learning/dates";
import { deriveState, normaliseOps } from "@/lib/learning/engine";
import { effectiveLevel, lessonAvailability, orderedLessonIds, recommendedLesson } from "@/lib/learning/path";
import { placementLevel } from "@/lib/learning/placement";
import { dueCards } from "@/lib/learning/revision";
import { STREAK_RULES, computeStreak } from "@/lib/learning/streak";
import { XP_RULES } from "@/lib/learning/xp";
import type { Op } from "@/lib/learning/types";
import { META, PROFILE, READ, REPEAT, UNIT_ORDER, attempt, lessonComplete, nextId } from "./helpers";

const D = "2026-10-01";

describe("XP", () => {
  it("is recalculated from the log, so duplicated ops never double-count", () => {
    const ops = [
      attempt(D, 0, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
      attempt(D, 1, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.sit", outcome: "incorrect" }),
      attempt(D, 2, READ, {
        objectiveIds: ["obj.read-cvc"],
        itemId: "en.w.sit",
        outcome: "correct",
        attemptNumber: 2,
      }),
      attempt(D, 3, REPEAT, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.map", outcome: "practised" }),
      lessonComplete(D, 4, "l20-blending"),
    ];
    const once = deriveState(ops, META, D);
    const twice = deriveState([...ops, ...ops, ...ops], META, D);
    const expected =
      XP_RULES.CORRECT_FIRST_TRY + XP_RULES.CORRECT_RETRY + XP_RULES.PRACTISED + XP_RULES.LESSON_FIRST_COMPLETION;
    expect(once.xp).toBe(expected);
    expect(twice.xp).toBe(expected);
  });

  it("gives a smaller repeat bonus at most once per lesson per day", () => {
    const ops = [
      lessonComplete(D, 0, "l10-satp"),
      lessonComplete(D, 10, "l10-satp"),
      lessonComplete(addDays(D, 1), 0, "l10-satp"),
    ];
    expect(deriveState(ops, META, addDays(D, 1)).xp).toBe(
      XP_RULES.LESSON_FIRST_COMPLETION + XP_RULES.LESSON_REPEAT_COMPLETION,
    );
  });

  it("adds a bonus when an objective is first mastered", () => {
    const ops = ["en.w.cat", "en.w.sit", "en.w.map"].map((w, i) =>
      attempt(D, i, READ, { objectiveIds: ["obj.read-cvc"], itemId: w, outcome: "correct" }),
    );
    expect(deriveState(ops, META, D).xp).toBe(3 * XP_RULES.CORRECT_FIRST_TRY + XP_RULES.OBJECTIVE_MASTERED);
  });

  it("is independent of the order ops arrive in (merging devices)", () => {
    const ops = Array.from({ length: 12 }, (_, i) =>
      attempt(addDays(D, i % 3), i, READ, {
        objectiveIds: ["obj.read-cvc"],
        itemId: ["en.w.cat", "en.w.sit", "en.w.map"][i % 3],
        outcome: i % 4 === 0 ? "incorrect" : "correct",
      }),
    );
    const a = deriveState(ops, META, addDays(D, 3));
    const b = deriveState([...ops].reverse(), META, addDays(D, 3));
    expect(b).toEqual(a);
  });
});

describe("streaks", () => {
  const day = (date: string, lessons = 1) => [date, { lessons, attempts: 0, activeAt: `${date}T09:00:00.000Z` }] as const;

  it("counts consecutive active days", () => {
    const s = computeStreak(new Map([day("2026-10-01"), day("2026-10-02"), day("2026-10-03")]), "2026-10-03");
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.todayActive).toBe(true);
  });

  it("does not break because today has not been active yet", () => {
    const s = computeStreak(new Map([day("2026-10-01"), day("2026-10-02")]), "2026-10-03");
    expect(s.current).toBe(2);
    expect(s.todayActive).toBe(false);
    expect(s.graceDates).toEqual([]);
  });

  it("covers missed days automatically with grace days", () => {
    const s = computeStreak(new Map([day("2026-10-01"), day("2026-10-02"), day("2026-10-04")]), "2026-10-04");
    expect(s.current).toBe(3);
    expect(s.graceDates).toEqual(["2026-10-03"]);
    expect(s.graceRemaining).toBe(STREAK_RULES.INITIAL_GRACE - 1);
  });

  it("starts again only when grace days run out", () => {
    const s = computeStreak(new Map([day("2026-10-01"), day("2026-10-06")]), "2026-10-06");
    // Four missed days, two grace days: the streak restarts.
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
  });

  it("earns an extra grace day for each week of active days, up to the maximum", () => {
    const entries = Array.from({ length: 21 }, (_, i) => day(addDays("2026-10-01", i)));
    const s = computeStreak(new Map(entries), "2026-10-21");
    expect(s.graceRemaining).toBe(STREAK_RULES.MAX_GRACE);
    expect(s.current).toBe(21);
  });

  it("counts a revision-only day once enough exercises were answered", () => {
    const fewer = Array.from({ length: STREAK_RULES.MIN_ATTEMPTS - 1 }, (_, i) =>
      attempt(D, i, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
    );
    expect(deriveState(fewer, META, D).streak.current).toBe(0);
    const enough = [
      ...fewer,
      attempt(D, 9, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "correct" }),
    ];
    expect(deriveState(enough, META, D).streak.current).toBe(1);
  });

  it("uses the device's local date of offline activity once synced", () => {
    // Activity done offline on 1 and 2 October, synced on the 3rd: the streak is 2, not 1.
    const offline = [lessonComplete("2026-10-01", 0, "l10-satp"), lessonComplete("2026-10-02", 0, "l11-inmd")];
    expect(deriveState(offline, META, "2026-10-03").streak.current).toBe(2);
  });
});

describe("spaced revision", () => {
  it("schedules a missed exercise for revision the same day, in box 1", () => {
    const s = deriveState(
      [attempt(D, 0, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "incorrect", exerciseId: "x.e01" })],
      META,
      D,
    );
    expect(s.revision["x.e01"]).toMatchObject({ box: 1, dueDate: D, lastFailedDecodeDate: D });
    expect(dueCards(s.revision, D, s.objectives).map((c) => c.exerciseId)).toEqual(["x.e01"]);
  });

  it("moves correct answers up the boxes with growing intervals", () => {
    const ops = [0, 1, 2].map((i) =>
      attempt(addDays(D, i * 10), 0, READ, {
        objectiveIds: ["obj.read-cvc"],
        itemId: "en.w.cat",
        outcome: "correct",
        exerciseId: "x.e01",
      }),
    );
    const s = deriveState(ops, META, addDays(D, 20));
    expect(s.revision["x.e01"].box).toBe(4);
    expect(s.revision["x.e01"].dueDate).toBe(addDays(D, 27));
  });

  it("puts failed decoding ahead of other due work", () => {
    const ops: Op[] = [
      attempt(D, 0, { type: "word_build", mode: "listen" }, {
        objectiveIds: ["obj.write-cvc"],
        itemId: "en.w.map",
        outcome: "incorrect",
        exerciseId: "x.build",
      }),
      attempt(D, 1, READ, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "incorrect", exerciseId: "x.read" }),
    ];
    const s = deriveState(ops, META, D);
    expect(dueCards(s.revision, D, s.objectives).map((c) => c.exerciseId)).toEqual(["x.read", "x.build"]);
  });

  it("does not schedule listen-and-repeat practice (it has no right answer)", () => {
    const s = deriveState(
      [attempt(D, 0, REPEAT, { objectiveIds: ["obj.read-cvc"], itemId: "en.w.cat", outcome: "practised", exerciseId: "x.rep" })],
      META,
      D,
    );
    expect(s.revision["x.rep"]).toBeUndefined();
  });
});

describe("placement", () => {
  const all = (correct: number, total = 3) => ({ correct, total });
  it("places a learner who cannot decode yet in Level 0", () => {
    expect(placementLevel({ hl_decoding: all(0), letter_sounds: all(1), letter_recognition: all(1) })).toBe(0);
  });
  it("places a home-language reader without English letter sounds in Level 1", () => {
    expect(placementLevel({ hl_decoding: all(3), letter_sounds: all(1), letter_recognition: all(3) })).toBe(1);
  });
  it("places learners with letter sounds but few sight words in Level 2", () => {
    expect(
      placementLevel({
        hl_decoding: all(3),
        letter_recognition: all(3),
        letter_sounds: all(3),
        sight_words: all(1),
        transfer_decoding: all(2, 2),
      }),
    ).toBe(2);
  });
  it("places strong readers in Level 4", () => {
    expect(
      placementLevel({
        hl_decoding: all(3),
        letter_recognition: all(3),
        letter_sounds: all(3),
        sight_words: all(3),
        transfer_decoding: all(2, 2),
        sentence_reading: all(2, 2),
      }),
    ).toBe(4);
  });
});

describe("learning path", () => {
  const order = orderedLessonIds(META, UNIT_ORDER);
  const levelOp = (level: number): Op => ({
    id: nextId(),
    profileId: PROFILE,
    type: "level_change",
    at: `${D}T07:00:00.000Z`,
    localDate: D,
    data: { level, reason: "learner" },
  });

  it("orders lessons by level, unit and order", () => {
    expect(order).toEqual(["l00-hl-vowels", "l10-satp", "l11-inmd", "l20-blending", "l30-first-sentences"]);
  });

  it("opens lessons at or below the learner's level and the one after each completed lesson", () => {
    const s = deriveState([levelOp(1), lessonComplete(D, 0, "l10-satp", 1, 6)], META, D);
    const av = lessonAvailability(META, s, order);
    expect(av).toEqual({
      "l00-hl-vowels": "open",
      "l10-satp": "completed",
      "l11-inmd": "open",
      "l20-blending": "locked",
      "l30-first-sentences": "locked",
    });
  });

  it("never blocks progress because of mistakes: completing with a low score opens the next lesson", () => {
    const s = deriveState(
      [levelOp(1), lessonComplete(D, 0, "l10-satp", 0, 6), lessonComplete(D, 5, "l11-inmd", 1, 6)],
      META,
      D,
    );
    expect(lessonAvailability(META, s, order)["l20-blending"]).toBe("open");
    expect(effectiveLevel(s, META)).toBe(1);
  });

  it("resumes an unfinished lesson first", () => {
    const progress: Op = {
      id: nextId(),
      profileId: PROFILE,
      type: "lesson_progress",
      at: `${D}T09:00:00.000Z`,
      localDate: D,
      data: { lessonId: "l11-inmd", stepIndex: 4 },
    };
    const s = deriveState([levelOp(1), progress], META, D);
    expect(recommendedLesson(META, s, order)).toEqual({ lessonId: "l11-inmd", resumeStep: 4 });
  });

  it("suggests the first open lesson at the learner's level", () => {
    const s = deriveState([levelOp(1)], META, D);
    expect(recommendedLesson(META, s, order)).toEqual({ lessonId: "l10-satp", resumeStep: 0 });
  });
});

describe("badges", () => {
  it("awards literacy badges at the moment the skill was first mastered", () => {
    const ops = ["en.w.cat", "en.w.sit", "en.w.map"].map((w, i) =>
      attempt(D, i, READ, { objectiveIds: ["obj.read-cvc"], itemId: w, outcome: "correct" }),
    );
    expect(deriveState(ops, META, D).badges["b.first-word"]).toEqual({ earnedAt: "2026-10-01T08:02:00.000Z" });
  });

  it("awards streak and lesson-count badges deterministically", () => {
    const ops = [
      lessonComplete("2026-10-01", 0, "l10-satp"),
      lessonComplete("2026-10-02", 0, "l11-inmd"),
      lessonComplete("2026-10-03", 0, "l11-inmd"),
    ];
    const s = deriveState(ops, META, "2026-10-03");
    expect(s.badges["b.streak-3"]).toEqual({ earnedAt: "2026-10-03T08:00:00.000Z" });
    expect(s.badges["b.two-lessons"]).toEqual({ earnedAt: "2026-10-02T08:00:00.000Z" });
  });
});

describe("normaliseOps", () => {
  it("drops duplicate op IDs and sorts by time", () => {
    const a = lessonComplete(D, 5, "l10-satp");
    const b = lessonComplete(D, 1, "l11-inmd");
    expect(normaliseOps([a, b, a]).map((o) => o.id)).toEqual([b.id, a.id]);
  });
});

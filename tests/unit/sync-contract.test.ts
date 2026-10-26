import { describe, expect, it } from "vitest";
import { ASSESSMENT_INSTRUMENT_VERSION } from "@/config/app";
import { newOp } from "@/learner/offline/oplog";
import { targetLexId } from "@/learner/tutor/tier1";
import type { Op } from "@/lib/learning/types";
import { OpSchema, SyncRequestSchema } from "@/server/ops";
import { compiledContent } from "./compiled-fixture";

const PROFILE = "6f0c2a52-3b7e-4d55-9a51-0f3c0c6d2a10";

/** What the server receives: the op after a JSON round trip (undefined keys dropped). */
function wire(op: Op): unknown {
  return JSON.parse(JSON.stringify(op));
}

function expectAccepted(op: Op) {
  const r = OpSchema.safeParse(wire(op));
  expect(r.success ? "accepted" : JSON.stringify(r.error.issues.slice(0, 3))).toBe("accepted");
}

describe("ops made by the app pass the server's sync validation", () => {
  const { lessons } = compiledContent();

  it("an attempt for every exercise of every lesson, in both languages", () => {
    let count = 0;
    for (const lang of ["zu", "st"] as const) {
      for (const lesson of lessons[lang]) {
        for (const step of lesson.steps) {
          if (step.kind !== "exercise") continue;
          for (const outcome of ["correct", "incorrect", "practised"] as const) {
            expectAccepted(
              newOp(
                "attempt",
                {
                  lessonId: lesson.id,
                  exerciseId: step.id,
                  exerciseType: step.type,
                  itemId: targetLexId(step) ?? step.id,
                  objectiveIds: step.objectives,
                  evidence: step.evidence,
                  outcome,
                  attemptNumber: outcome === "incorrect" ? 2 : 1,
                  supported: false,
                  errorType: outcome === "incorrect" ? step.errorTypes[0] : undefined,
                  selfCheck: outcome === "practised" ? "no_recording" : undefined,
                  responseMs: 4200,
                  revision: undefined,
                },
                PROFILE,
              ),
            );
            count++;
          }
        }
        expectAccepted(newOp("lesson_progress", { lessonId: lesson.id, stepIndex: lesson.steps.length - 1 }, PROFILE));
        expectAccepted(newOp("lesson_complete", { lessonId: lesson.id, correct: 6, total: 11, durationMs: 300_000, dataBytes: 0 }, PROFILE));
      }
    }
    expect(count).toBeGreaterThan(100);
  });

  it("a skipped placement (no scores) and a partial placement", () => {
    expectAccepted(newOp("assessment", { kind: "placement", instrument: ASSESSMENT_INSTRUMENT_VERSION, skipped: true, scores: {}, placedLevel: 0 }, PROFILE));
    expectAccepted(
      newOp(
        "assessment",
        {
          kind: "placement",
          instrument: ASSESSMENT_INSTRUMENT_VERSION,
          skipped: true,
          scores: { hl_decoding: { correct: 3, total: 4 }, letter_recognition: { correct: 1, total: 4 } },
          placedLevel: 1,
        },
        PROFILE,
      ),
    );
  });

  it("level changes, in a sync request", () => {
    const op = newOp("level_change", { level: 2, reason: "learner" }, PROFILE);
    const r = SyncRequestSchema.safeParse({ deviceProfileId: PROFILE, cursor: 0, ops: [wire(op)] });
    expect(r.success).toBe(true);
  });

  it("rejects ops whose IDs or payloads are malformed", () => {
    const op = wire(newOp("level_change", { level: 2, reason: "learner" }, PROFILE)) as Record<string, unknown>;
    expect(OpSchema.safeParse({ ...op, id: "not-a-uuid" }).success).toBe(false);
    expect(OpSchema.safeParse({ ...op, data: { level: 9, reason: "learner" } }).success).toBe(false);
    expect(OpSchema.safeParse({ ...op, extra: true }).success).toBe(false);
  });
});

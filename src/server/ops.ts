import { z } from "zod";
import { isLocalDate } from "@/lib/learning/dates";
import { COMPETENCIES, ERROR_TYPES } from "@/lib/content/schema";

/**
 * Validation of operations arriving from devices. Everything a device sends
 * is untrusted: IDs, timestamps and payloads are checked before storage.
 */
const isoTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, "UTC ISO timestamp")
  .refine((s) => {
    const t = Date.parse(s);
    // Device clocks drift; accept up to a day in the future and back to 2025.
    return Number.isFinite(t) && t < Date.now() + 86_400_000 && t > Date.parse("2025-01-01T00:00:00Z");
  }, "timestamp out of range");
const localDate = z.string().refine(isLocalDate, "YYYY-MM-DD");
const shortId = z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/);

const evidence = z.array(z.object({ competency: z.enum(COMPETENCIES), weight: z.number().min(0).max(1) }).strict()).max(4);

const base = {
  id: z.uuid(),
  profileId: z.uuid(),
  at: isoTimestamp,
  localDate,
};

export const OpSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("attempt"),
      data: z
        .object({
          lessonId: shortId,
          exerciseId: shortId,
          exerciseType: shortId,
          itemId: shortId,
          objectiveIds: z.array(shortId).min(1).max(6),
          evidence,
          outcome: z.enum(["correct", "incorrect", "practised"]),
          attemptNumber: z.number().int().min(1).max(5),
          supported: z.boolean(),
          errorType: z.enum(ERROR_TYPES).optional(),
          selfCheck: z.enum(["same", "different", "no_recording"]).optional(),
          responseMs: z.number().int().min(0).max(3_600_000).optional(),
          revision: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("lesson_complete"),
      data: z
        .object({
          lessonId: shortId,
          correct: z.number().int().min(0).max(500),
          total: z.number().int().min(0).max(500),
          durationMs: z.number().int().min(0).max(86_400_000),
          dataBytes: z.number().int().min(0).max(1_000_000_000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("lesson_progress"),
      data: z.object({ lessonId: shortId, stepIndex: z.number().int().min(0).max(500) }).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("assessment"),
      data: z
        .object({
          kind: z.enum(["placement", "pre", "post", "retake"]),
          instrument: shortId,
          skipped: z.boolean(),
          scores: z.partialRecord(
            z.enum(["hl_decoding", "letter_recognition", "letter_sounds", "sight_words", "sentence_reading", "transfer_decoding"]),
            z.object({ correct: z.number().int().min(0).max(50), total: z.number().int().min(0).max(50) }).strict(),
          ),
          placedLevel: z.number().int().min(0).max(5),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("level_change"),
      data: z.object({ level: z.number().int().min(0).max(5), reason: z.enum(["learner", "facilitator", "assessment"]) }).strict(),
    })
    .strict(),
]);

export const SyncRequestSchema = z
  .object({
    deviceProfileId: z.uuid(),
    /** Highest server sequence number this device already has. */
    cursor: z.number().int().min(0).default(0),
    ops: z.array(OpSchema).max(500),
  })
  .strict();

export type SyncRequest = z.infer<typeof SyncRequestSchema>;

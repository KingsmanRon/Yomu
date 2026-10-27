import { z } from "zod";
import { handler, json } from "@/server/http";
import { logServerError } from "@/server/observability";
import { providers } from "@/server/providers";
import { serverEnv } from "@/server/env";
import { HttpError, requireLearner } from "@/server/supabase";
import { askTutor } from "@/server/tutor/ask";
import { tutorContext } from "@/server/tutor/context";
import { isHealthy, recordFailure, recordSuccess } from "@/server/tutor/health";
import { loadMatrix } from "@/server/tutor/matrix";
import { supabaseTutorStore } from "@/server/tutor/store";

const MAX_AUDIO_BYTES = 600_000;
const Fields = z.object({
  lang: z.enum(["zu", "st"]),
  lessonId: z.string().regex(/^l\d\d-[a-z0-9-]+$/),
  stepId: z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
});

/**
 * Tier 2 (and, when verified, Tier 3): a spoken question about the current
 * lesson step. The audio is read into memory for this one request, passed to
 * the speech-to-text provider and then dropped; it is never written anywhere.
 */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_AUDIO_BYTES + 10_000) throw new HttpError(413, "too_large");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "invalid_form");
  }
  const fields = Fields.parse({ lang: form.get("lang"), lessonId: form.get("lessonId"), stepId: form.get("stepId") });
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) throw new HttpError(400, "no_audio");
  if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(413, "too_large");
  if (audio.type && !/^(audio\/|application\/octet-stream|text\/plain)/.test(audio.type)) throw new HttpError(415, "not_audio");
  const context = tutorContext(fields.lang, fields.lessonId, fields.stepId);
  if (!context) throw new HttpError(404, "step_not_found");

  const { stt, llm, tts } = providers();
  const result = await askTutor(
    {
      matrix: loadMatrix().matrix,
      stt,
      llm,
      tts,
      health: { isHealthy, recordSuccess, recordFailure },
      store: supabaseTutorStore(),
      now: () => new Date(),
      limits: { timeoutMs: serverEnv.ai.timeoutMs, maxQuestionSeconds: serverEnv.ai.maxQuestionSeconds, logRetentionDays: serverEnv.ai.logRetentionDays },
      onProviderError: (e, provider) => void logServerError(e, { path: "/api/tutor/ask", provider }, learner.pseudonym),
    },
    { learnerId: learner.id, pseudonym: learner.pseudonym, lang: fields.lang, audio, lessonId: fields.lessonId, stepId: fields.stepId, context },
  );
  return json(result);
});

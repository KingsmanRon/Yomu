import { z } from "zod";
import { tutorTiers } from "@/lib/capabilities/tiers";
import { isHelpIntent, type TutorIntent } from "@/lib/tutor/intents";
import { devToolsEnabled } from "@/server/devtools";
import { backendReady, serverEnv } from "@/server/env";
import { handler, json } from "@/server/http";
import { providers, providerSelection } from "@/server/providers";
import { HttpError } from "@/server/supabase";
import { tutorContext } from "@/server/tutor/context";
import { isHealthy } from "@/server/tutor/health";
import { loadMatrix } from "@/server/tutor/matrix";
import { supabaseTutorStore } from "@/server/tutor/store";
import { scrub } from "@/server/observability";

const Fields = z.object({
  lang: z.enum(["zu", "st"]),
  lessonId: z.string().regex(/^l\d\d-[a-z0-9-]+$/),
  stepId: z.string().regex(/^[A-Za-z0-9._-]+$/),
  draft: z.enum(["true", "false"]).default("false"),
});

/**
 * Developer tutor lab: runs the configured providers on one question and
 * shows every intermediate result, including for providers the capability
 * matrix has not verified (that is what the lab is for). Not available in
 * production, not reachable from the learner app, stores nothing about
 * anyone, and real providers still count against the daily spending cap.
 */
export const POST = handler(async (request) => {
  if (!devToolsEnabled()) throw new HttpError(404, "not_found");
  const form = await request.formData();
  const f = Fields.parse({ lang: form.get("lang"), lessonId: form.get("lessonId"), stepId: form.get("stepId"), draft: form.get("draft") ?? undefined });
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > 600_000) throw new HttpError(400, "no_audio");
  const context = tutorContext(f.lang, f.lessonId, f.stepId);
  if (!context) throw new HttpError(404, "step_not_found");

  const { matrix } = loadMatrix();
  const tiers = tutorTiers(matrix, f.lang, providerSelection(), isHealthy, true);
  const { stt, llm } = providers();
  if (!stt || !llm) throw new HttpError(409, "providers_not_configured", "Set AI_STT_PROVIDER and AI_LLM_PROVIDER.");

  const estimate = stt.estimateCostUsd(serverEnv.ai.maxQuestionSeconds) + llm.maxClassifyCostUsd() + (f.draft === "true" ? llm.maxExplainCostUsd() : 0);
  const day = new Date().toISOString().slice(0, 10);
  const store = estimate > 0 ? (backendReady() ? supabaseTutorStore() : null) : null;
  if (estimate > 0 && !store) throw new HttpError(503, "spend_cap_needs_database", "Paid providers need the database for the spending cap.");
  if (store && !(await store.reserveSpend(day, estimate))) throw new HttpError(429, "spend_cap");

  const started = Date.now();
  let spent = 0;
  const signal = AbortSignal.timeout(serverEnv.ai.timeoutMs);
  try {
    const transcript = await stt.transcribe(audio, f.lang, signal);
    spent += transcript.costUsd;
    const question = scrub(transcript.text).trim();
    const classified = question ? await llm.classifyIntent({ transcript: question, lang: f.lang, context, pseudonym: "lab" }, signal) : null;
    spent += classified?.costUsd ?? 0;
    const intent: TutorIntent = classified?.intent ?? "unknown";
    const draft = f.draft === "true" && question ? await llm.draftExplanation({ question, lang: f.lang, context, pseudonym: "lab" }, signal).catch((e: Error) => ({ text: `(no draft: ${e.message})`, costUsd: 0 })) : null;
    spent += draft?.costUsd ?? 0;
    return json({
      matrixVersion: matrix.version,
      learnerTiers: tiers,
      providers: { stt: stt.id, llm: llm.id },
      context,
      transcript: transcript.text,
      sentToModel: question,
      intent,
      learnerWouldHear: !isHelpIntent(intent)
        ? intent === "off_topic"
          ? "clip tutor.off_topic"
          : "clip tutor.cant_answer_yet"
        : context.availableHelp.includes(intent)
          ? `tap-to-help option '${intent}'`
          : `clip tutor.cant_answer_yet ('${intent}' help is not offered on this step)`,
      draft: draft ? { label: "AI-generated, unverified", text: draft.text } : null,
      costUsd: { reserved: estimate, actual: spent },
      ms: Date.now() - started,
    });
  } finally {
    if (store) await store.settleSpend(day, spent - estimate);
  }
});

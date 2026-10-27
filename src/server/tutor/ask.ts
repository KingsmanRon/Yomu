import "server-only";
import { tutorTiers, type CapabilityMatrix } from "@/lib/capabilities/tiers";
import type { TutorAskResult, TutorIntent } from "@/lib/tutor/intents";
import { scrub } from "../observability";
import { ProviderError, type IntentRequest, type LanguageModel, type SpeechToText, type TeachingLang, type TextToSpeech } from "../providers/types";

/**
 * A spoken question to the tutor, end to end:
 *
 *  1. Only when the capability matrix verifies speech-to-text and the
 *     language model for this language (Tier 2); otherwise "unavailable".
 *  2. Per-learner rate limit, then a reservation against the global daily
 *     spending cap, before any provider is called. Over either: "resting".
 *  3. Speech-to-text (the audio is used once, in memory, and never stored),
 *     then the question is scrubbed of numbers and contact details.
 *  4. The language model picks one intent from a fixed list. The app answers
 *     help intents with the same validated recordings as tap-to-help, and
 *     off-topic and unknown questions with fixed recorded replies.
 *  5. Only if Tier 3 is verified (a verified voice exists for the language),
 *     an unknown question gets a short generated explanation, spoken.
 *  6. The text of the exchange is logged with an expiry date (never audio);
 *     unknown questions are also logged without any learner identifier, for
 *     content authors. Provider failures open a circuit breaker and the
 *     learner hears "resting"; tap-to-help keeps working. A failed call
 *     keeps its spending reservation (it may still have been billed).
 */
export interface TutorStore {
  rateCheck(learnerId: string, tier: 2 | 3): Promise<boolean>;
  /** Reserve against the daily cap; false when it would be exceeded. */
  reserveSpend(day: string, estimateUsd: number): Promise<boolean>;
  settleSpend(day: string, deltaUsd: number): Promise<void>;
  logExchange(row: {
    learner_id: string;
    tier: 2 | 3;
    language: TeachingLang;
    lesson_id: string;
    exercise_id: string | null;
    request_text: string;
    response_text: string | null;
    intent: TutorIntent | null;
    clip_id: string | null;
    provider: string;
    generated: boolean;
    expires_at: string;
  }): Promise<void>;
  logUnanswered(row: { language: TeachingLang; lesson_id: string; exercise_id: string | null; transcript: string; classified_intent: string }): Promise<void>;
}

export interface AskDeps {
  matrix: CapabilityMatrix;
  stt: SpeechToText | null;
  llm: LanguageModel | null;
  tts: TextToSpeech | null;
  health: { isHealthy(provider: string): boolean; recordSuccess(provider: string): void; recordFailure(provider: string): void };
  store: TutorStore;
  now: () => Date;
  limits: { timeoutMs: number; maxQuestionSeconds: number; logRetentionDays: number };
  onProviderError?: (e: unknown, provider: string) => void;
}

export interface AskInput {
  learnerId: string;
  pseudonym: string;
  lang: TeachingLang;
  audio: Blob;
  lessonId: string;
  stepId: string;
  context: IntentRequest["context"];
}

const CLIP_FOR: Partial<Record<TutorIntent, string>> = { off_topic: "tutor.off_topic", unknown: "tutor.cant_answer_yet" };

/** Runs `fn` with an abort signal that fires after `ms`; rejects with a timeout even if the provider ignores the signal. */
async function withTimeout<T>(provider: string, ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderError(provider, "timeout", `no answer within ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function askTutor(deps: AskDeps, input: AskInput): Promise<TutorAskResult> {
  const { stt, llm, tts, store, health } = deps;
  const tiers = tutorTiers(deps.matrix, input.lang, { stt: stt?.id, llm: llm?.id, tts: tts?.id }, (p) => health.isHealthy(p), true);
  if (!tiers.spokenQuestions || !stt || !llm) return { outcome: "unavailable" };

  if (!(await store.rateCheck(input.learnerId, 2))) return { outcome: "resting", reason: "rate_limited" };

  const day = deps.now().toISOString().slice(0, 10);
  let reserved = stt.estimateCostUsd(deps.limits.maxQuestionSeconds) + llm.maxClassifyCostUsd();
  if (!(await store.reserveSpend(day, reserved))) return { outcome: "resting", reason: "spend_cap" };

  let spent = 0;
  // A failed or timed-out call may still be billed: keep its reservation.
  let failed = false;
  let current = stt.id;
  const expiresAt = new Date(deps.now().getTime() + deps.limits.logRetentionDays * 86_400_000).toISOString();
  const exerciseId = input.context.stepKind === "exercise" ? input.stepId : null;
  try {
    const transcript = await withTimeout(stt.id, deps.limits.timeoutMs, (signal) => stt.transcribe(input.audio, input.lang, signal));
    if (transcript.language !== input.lang) throw new ProviderError(stt.id, "wrong_language");
    spent += transcript.costUsd;
    health.recordSuccess(stt.id);
    const question = scrub(transcript.text).trim();

    let intent: TutorIntent = "unknown";
    if (question) {
      current = llm.id;
      const r = await withTimeout(llm.id, deps.limits.timeoutMs, (signal) =>
        llm.classifyIntent({ transcript: question, lang: input.lang, context: input.context, pseudonym: input.pseudonym }, signal),
      );
      spent += r.costUsd;
      health.recordSuccess(llm.id);
      intent = r.intent;
    }

    // Tier 3: a generated, spoken explanation for a question no recording answers.
    if (intent === "unknown" && question && tiers.generatedSpeech && tts && (await store.rateCheck(input.learnerId, 3))) {
      const extra = llm.maxExplainCostUsd() + tts.estimateCostUsd(600);
      if (await store.reserveSpend(day, extra)) {
        reserved += extra;
        current = llm.id;
        const draft = await withTimeout(llm.id, deps.limits.timeoutMs, (signal) =>
          llm.draftExplanation({ question, lang: input.lang, context: input.context, pseudonym: input.pseudonym }, signal),
        );
        spent += draft.costUsd;
        current = tts.id;
        const speech = await withTimeout(tts.id, deps.limits.timeoutMs, (signal) => tts.synthesize(draft.text, input.lang, signal));
        spent += speech.costUsd;
        health.recordSuccess(tts.id);
        await store.logExchange({
          learner_id: input.learnerId,
          tier: 3,
          language: input.lang,
          lesson_id: input.lessonId,
          exercise_id: exerciseId,
          request_text: question.slice(0, 1000),
          response_text: draft.text.slice(0, 4000),
          intent,
          clip_id: null,
          provider: `${llm.id}+${tts.id}`,
          generated: true,
          expires_at: expiresAt,
        });
        return { outcome: "speech", audio: Buffer.from(speech.audio).toString("base64"), mime: speech.mime };
      }
    }

    await store.logExchange({
      learner_id: input.learnerId,
      tier: 2,
      language: input.lang,
      lesson_id: input.lessonId,
      exercise_id: exerciseId,
      request_text: question.slice(0, 1000),
      response_text: null,
      intent,
      clip_id: CLIP_FOR[intent] ?? null,
      provider: question ? `${stt.id}+${llm.id}` : stt.id,
      generated: false,
      expires_at: expiresAt,
    });
    if (intent === "unknown" && question) {
      await store.logUnanswered({
        language: input.lang,
        lesson_id: input.lessonId,
        exercise_id: exerciseId,
        transcript: question.slice(0, 500),
        classified_intent: intent,
      });
    }
    return { outcome: "intent", intent };
  } catch (e) {
    failed = true;
    const provider = e instanceof ProviderError ? e.provider : current;
    health.recordFailure(provider);
    deps.onProviderError?.(e, provider);
    return { outcome: "resting", reason: "provider_error" };
  } finally {
    if (!failed) await store.settleSpend(day, spent - reserved);
  }
}

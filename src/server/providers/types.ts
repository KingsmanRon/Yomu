import "server-only";
import type { TutorIntent } from "@/lib/tutor/intents";

/**
 * Provider abstraction for the AI tutor. Each adapter states its matrix ID
 * (config/capabilities.json); whether a learner may use it is decided by the
 * matrix, never by the adapter. Adapters receive only what the task needs:
 * no learner identifiers other than an opaque pseudonym, and never audio
 * beyond the single request (nothing is stored).
 */
export type TeachingLang = "zu" | "st";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public code: "timeout" | "rate_limited" | "unavailable" | "bad_response" | "wrong_language" | "auth" | "refused",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface Transcript {
  text: string;
  /** Language the provider says it transcribed. Must equal the requested language. */
  language: TeachingLang;
  costUsd: number;
}

export interface SpeechToText {
  /** Matrix provider ID, e.g. "lelapa-vulavula". */
  readonly id: string;
  /** Worst-case cost of one request of up to `seconds` of audio. */
  estimateCostUsd(seconds: number): number;
  transcribe(audio: Blob, lang: TeachingLang, signal: AbortSignal): Promise<Transcript>;
}

export interface IntentRequest {
  /** What the learner said, already transcribed and scrubbed of numbers and contact details. */
  transcript: string;
  lang: TeachingLang;
  /** What is on screen, so "this word" can be understood. English only; no learner data. */
  context: { lessonTitle: string; stepKind: "teach" | "exercise"; exerciseType?: string; targetText?: string; availableHelp: string[] };
  /** Opaque pseudonym for abuse detection. */
  pseudonym: string;
}

export interface IntentResult {
  intent: TutorIntent;
  costUsd: number;
}

export interface ExplanationRequest {
  /** The learner's question, transcribed and scrubbed. */
  question: string;
  lang: TeachingLang;
  context: IntentRequest["context"];
  pseudonym: string;
}

export interface LanguageModel {
  readonly id: string;
  /** Worst-case cost of one classification. */
  maxClassifyCostUsd(): number;
  classifyIntent(req: IntentRequest, signal: AbortSignal): Promise<IntentResult>;
  /** Worst-case cost of one Tier 3 draft. */
  maxExplainCostUsd(): number;
  /** Tier 3 only: a short explanation in the teaching language. Never shown as text to learners. */
  draftExplanation(req: ExplanationRequest, signal: AbortSignal): Promise<{ text: string; costUsd: number }>;
}

export interface TextToSpeech {
  readonly id: string;
  estimateCostUsd(chars: number): number;
  synthesize(text: string, lang: TeachingLang, signal: AbortSignal): Promise<{ audio: Uint8Array; mime: string; costUsd: number }>;
}

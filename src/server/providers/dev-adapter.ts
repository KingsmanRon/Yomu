import "server-only";
import type { TutorIntent } from "@/lib/tutor/intents";
import type { ExplanationRequest, IntentRequest, LanguageModel, SpeechToText, TeachingLang, TextToSpeech, Transcript } from "./types";

/**
 * Development adapter: deterministic stand-ins for the AI providers, so the
 * tutor pipeline can be developed and tested offline and without cost. It is
 * NOT speech recognition or AI. Its matrix entries are 'unsupported', so it
 * can never be shown to learners; it is used by automated tests and the
 * developer tutor lab.
 *
 * Speech-to-text: an "audio" upload whose content starts with `DEVTEXT:` is
 * read as the transcript (that is how tests and the lab send a question);
 * anything else (real audio) transcribes to an empty string.
 */
export const DEV_PROVIDER = "dev-adapter";

export class DevSpeechToText implements SpeechToText {
  readonly id = DEV_PROVIDER;
  estimateCostUsd(): number {
    return 0;
  }
  async transcribe(audio: Blob, lang: TeachingLang): Promise<Transcript> {
    const head = await audio.slice(0, 2000).text();
    const m = /^DEVTEXT:([\s\S]*)$/.exec(head);
    return { text: m ? m[1].trim().slice(0, 500) : "", language: lang, costUsd: 0 };
  }
}

/** Keyword rules in English, isiZulu and Sesotho (first match wins). Draft word lists, for development only. */
const RULES: [TutorIntent, RegExp][] = [
  ["off_topic", /\b(money|imali|chelete|weather|izulu|lehodimo|football|ibhola|bolo|loan|news|izindaba|ditaba)\b/i],
  ["slow", /\b(slow|slowly|kancane|butle)\b/i],
  ["meaning", /\b(mean|meaning|means|kusho|ukusho|bolela|bolelang|translate)\b/i],
  ["letter", /\b(letter|sound|umsindo|uhlamvu|modumo|tlhaku)\b/i],
  ["how", /\b(how|kanjani|jwang|ngenzeni|etse)\b/i],
  ["replay", /\b(again|repeat|futhi|phinda|hape|pheta)\b/i],
  ["hear", /\b(say|hear|izwa|yizwa|utlwa|read it)\b/i],
];

export function devClassify(transcript: string): TutorIntent {
  const t = transcript.toLowerCase();
  if (!t.trim()) return "unknown";
  for (const [intent, re] of RULES) if (re.test(t)) return intent;
  return "unknown";
}

export class DevLanguageModel implements LanguageModel {
  readonly id = DEV_PROVIDER;
  maxClassifyCostUsd(): number {
    return 0;
  }
  async classifyIntent(req: IntentRequest) {
    return { intent: devClassify(req.transcript), costUsd: 0 };
  }
  maxExplainCostUsd(): number {
    return 0;
  }
  async draftExplanation(req: ExplanationRequest) {
    return { text: `[development adapter: no explanation generated for "${req.question.slice(0, 80)}"]`, costUsd: 0 };
  }
}

/** Returns a fixed, tiny, silent Ogg page header stand-in: only for exercising code paths in tests. */
export class DevTextToSpeech implements TextToSpeech {
  readonly id = DEV_PROVIDER;
  estimateCostUsd(): number {
    return 0;
  }
  async synthesize() {
    return { audio: new TextEncoder().encode("OggS-dev-adapter"), mime: "audio/ogg", costUsd: 0 };
  }
}

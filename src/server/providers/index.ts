import "server-only";
import type { ProviderSelection } from "@/lib/capabilities/tiers";
import { serverEnv } from "../env";
import { DevLanguageModel, DevSpeechToText, DevTextToSpeech } from "./dev-adapter";
import { AnthropicLanguageModel } from "./llm-anthropic";
import { VulavulaSpeechToText } from "./stt-vulavula";
import type { LanguageModel, SpeechToText, TextToSpeech } from "./types";

/**
 * The providers configured for this server (AI_STT_PROVIDER, AI_LLM_PROVIDER,
 * AI_TTS_PROVIDER). Configuring a provider does not make it available to
 * learners: the capability matrix decides that.
 */
let cached: { stt: SpeechToText | null; llm: LanguageModel | null; tts: TextToSpeech | null } | null = null;

export function providers() {
  if (cached) return cached;
  const ai = serverEnv.ai;
  const stt =
    ai.stt === "dev"
      ? new DevSpeechToText()
      : ai.stt === "vulavula"
        ? new VulavulaSpeechToText(ai.vulavulaKey, ai.vulavulaCostPerMinuteUsd, ai.maxQuestionSeconds, ai.vulavulaBaseUrl)
        : null;
  const llm = ai.llm === "dev" ? new DevLanguageModel() : ai.llm === "anthropic" ? new AnthropicLanguageModel(ai.llmModel, ai.timeoutMs) : null;
  const tts = ai.tts === "dev" ? new DevTextToSpeech() : null;
  cached = { stt, llm, tts };
  return cached;
}

export function providerSelection(): ProviderSelection {
  const p = providers();
  return { stt: p.stt?.id, llm: p.llm?.id, tts: p.tts?.id };
}

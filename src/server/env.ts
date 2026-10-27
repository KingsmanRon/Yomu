import "server-only";

/**
 * Server configuration from environment variables. Secrets are read here and
 * nowhere else, and never cross into client bundles (`server-only`).
 */
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export type LlmProviderName = "dev" | "anthropic" | "none";
export type SttProviderName = "dev" | "vulavula" | "none";
export type TtsProviderName = "dev" | "none";

export const serverEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  pinPepper: process.env.PIN_PEPPER ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  analyticsEnabled: process.env.ANALYTICS_ENABLED !== "false",
  ai: {
    llm: (process.env.AI_LLM_PROVIDER ?? "dev") as LlmProviderName,
    stt: (process.env.AI_STT_PROVIDER ?? "dev") as SttProviderName,
    tts: (process.env.AI_TTS_PROVIDER ?? "none") as TtsProviderName,
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
    llmModel: process.env.AI_LLM_MODEL || "claude-opus-5-5",
    vulavulaKey: process.env.VULAVULA_API_KEY ?? "",
    vulavulaBaseUrl: process.env.VULAVULA_BASE_URL || "https://vulavula-services.lelapa.ai",
    /** Set from the customer's contract; deliberately high by default so the spending cap errs on the safe side. */
    vulavulaCostPerMinuteUsd: num("VULAVULA_COST_PER_MINUTE_USD", 0.1),
    /** Per provider call. */
    timeoutMs: num("AI_TIMEOUT_MS", 15000),
    /** Longest spoken question accepted (the app stops recording at 8 s). */
    maxQuestionSeconds: num("AI_MAX_QUESTION_SECONDS", 10),
    dailyCapUsd: num("AI_DAILY_SPEND_CAP_USD", 5),
    perMinute: num("AI_RATE_LIMIT_PER_MINUTE", 6),
    perDay: num("AI_RATE_LIMIT_PER_DAY", 60),
    logRetentionDays: num("TUTOR_LOG_RETENTION_DAYS", 90),
  },
};

export function backendReady(): boolean {
  return !!(serverEnv.supabaseUrl && serverEnv.supabaseSecretKey);
}

export function requirePepper(): string {
  if (serverEnv.pinPepper.length < 16) throw new Error("PIN_PEPPER must be set (at least 16 characters)");
  return serverEnv.pinPepper;
}

import "server-only";
import { ProviderError, type SpeechToText, type TeachingLang, type Transcript } from "./types";

/**
 * Lelapa AI Vulavula speech-to-text (synchronous file transcription).
 *
 * From the vendor documentation (checked 2026-10-26; the docs give no full
 * response schema, so confirm with a live call during evaluation):
 *   POST {base}/api/v2alpha/transcribe/sync/file?lang_code=zul|sot
 *   header X-CLIENT-TOKEN, multipart body with the audio file
 *   response JSON with `transcription_text` and `language_code`
 *
 * The returned language must match the one requested: a transcript in
 * another language is rejected, never passed on as if it were isiZulu or
 * Sesotho. Not verified for learners (see config/capabilities.json).
 */
export const VULAVULA_PROVIDER = "lelapa-vulavula";
const LANG_CODE: Record<TeachingLang, string> = { zu: "zul", st: "sot" };

export class VulavulaSpeechToText implements SpeechToText {
  readonly id = VULAVULA_PROVIDER;

  constructor(
    private readonly apiKey: string,
    /** From the customer's contract; the default is deliberately high so the spending cap errs on the safe side. */
    private readonly costPerMinuteUsd: number,
    private readonly maxSeconds: number,
    private readonly baseUrl = "https://vulavula-services.lelapa.ai",
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  estimateCostUsd(seconds: number): number {
    return (Math.max(seconds, 1) / 60) * this.costPerMinuteUsd;
  }

  async transcribe(audio: Blob, lang: TeachingLang, signal: AbortSignal): Promise<Transcript> {
    if (!this.apiKey) throw new ProviderError(this.id, "auth", "VULAVULA_API_KEY is not set");
    const form = new FormData();
    const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
    form.set("file", audio, `question.${ext}`);
    let res: Response;
    try {
      res = await this.doFetch(`${this.baseUrl}/api/v2alpha/transcribe/sync/file?lang_code=${LANG_CODE[lang]}`, {
        method: "POST",
        headers: { "X-CLIENT-TOKEN": this.apiKey },
        body: form,
        signal,
      });
    } catch (e) {
      throw new ProviderError(this.id, signal.aborted ? "timeout" : "unavailable", (e as Error).message);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError(this.id, "auth", `HTTP ${res.status}`);
    if (res.status === 429) throw new ProviderError(this.id, "rate_limited", "HTTP 429");
    if (!res.ok) throw new ProviderError(this.id, "unavailable", `HTTP ${res.status}`);
    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new ProviderError(this.id, "bad_response", "response is not JSON");
    }
    if (typeof body.transcription_text !== "string") throw new ProviderError(this.id, "bad_response", "no transcription_text in response");
    const returned = typeof body.language_code === "string" ? body.language_code.toLowerCase() : null;
    if (returned && returned !== LANG_CODE[lang]) {
      throw new ProviderError(this.id, "wrong_language", `requested ${LANG_CODE[lang]}, transcribed as ${returned}`);
    }
    return { text: body.transcription_text.trim().slice(0, 1000), language: lang, costUsd: this.estimateCostUsd(this.maxSeconds) };
  }
}

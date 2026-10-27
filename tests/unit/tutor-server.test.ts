import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tutorTiers, type CapabilityEntry, type CapabilityMatrix } from "@/lib/capabilities/tiers";
import { DEV_PROVIDER, DevLanguageModel, DevSpeechToText, DevTextToSpeech, devClassify } from "@/server/providers/dev-adapter";
import { AnthropicLanguageModel, responseCostUsd } from "@/server/providers/llm-anthropic";
import { VulavulaSpeechToText } from "@/server/providers/stt-vulavula";
import { ProviderError, type LanguageModel, type SpeechToText, type TeachingLang } from "@/server/providers/types";
import { askTutor, type AskDeps, type AskInput, type TutorStore } from "@/server/tutor/ask";
import { loadMatrix } from "@/server/tutor/matrix";

const LEARNER = "9b2f3c4d-1111-4a5b-8c6d-000000000001";

function verified(provider: string, language: "zu" | "st", capability: CapabilityEntry["capability"]): CapabilityEntry {
  return { provider, language, capability, status: "verified", verifiedAt: "2026-10-01", verifierRole: "native_speaker_panel", learnerVisible: true, notes: "test fixture entry" };
}

/** An in-memory store with the same rules as the database functions. */
class MemoryStore implements TutorStore {
  spent = 0;
  requests: { tier: number }[] = [];
  logs: Parameters<TutorStore["logExchange"]>[0][] = [];
  unanswered: Parameters<TutorStore["logUnanswered"]>[0][] = [];
  settled: number[] = [];
  constructor(
    private cap = 5,
    private perDay = 60,
  ) {}
  async rateCheck(_learner: string, tier: 2 | 3) {
    if (this.requests.length >= this.perDay) return false;
    this.requests.push({ tier });
    return true;
  }
  async reserveSpend(_day: string, estimate: number) {
    if (this.spent + estimate > this.cap) return false;
    this.spent += estimate;
    return true;
  }
  async settleSpend(_day: string, delta: number) {
    this.settled.push(delta);
    this.spent = Math.max(0, this.spent + delta);
  }
  async logExchange(row: Parameters<TutorStore["logExchange"]>[0]) {
    this.logs.push(row);
  }
  async logUnanswered(row: Parameters<TutorStore["logUnanswered"]>[0]) {
    this.unanswered.push(row);
  }
}

const health = () => {
  const failures: string[] = [];
  return { failures, isHealthy: () => true, recordSuccess: () => {}, recordFailure: (p: string) => void failures.push(p) };
};

function deps(over: Partial<AskDeps> = {}): AskDeps & { health: ReturnType<typeof health>; store: MemoryStore } {
  const matrix: CapabilityMatrix = {
    version: "test",
    entries: [verified(DEV_PROVIDER, "zu", "stt"), verified(DEV_PROVIDER, "zu", "llm_dialogue")],
  };
  return {
    matrix,
    stt: new DevSpeechToText(),
    llm: new DevLanguageModel(),
    tts: null,
    health: health(),
    store: new MemoryStore(),
    now: () => new Date("2026-10-26T10:00:00Z"),
    limits: { timeoutMs: 200, maxQuestionSeconds: 10, logRetentionDays: 90 },
    ...over,
  } as AskDeps & { health: ReturnType<typeof health>; store: MemoryStore };
}

function input(transcript: string, over: Partial<AskInput> = {}): AskInput {
  return {
    learnerId: LEARNER,
    pseudonym: "l_abc123",
    lang: "zu",
    audio: new Blob([`DEVTEXT:${transcript}`], { type: "text/plain" }),
    lessonId: "l20-blending",
    stepId: "l20-blending.e03",
    context: { lessonTitle: "Blending", stepKind: "exercise", exerciseType: "picture_match", targetText: "cat", availableHelp: ["replay", "how", "hear", "meaning"] },
    ...over,
  };
}

describe("capability gating with the shipped matrix", () => {
  it("offers only Tier 1 in both languages until providers are verified", () => {
    const { matrix, problems } = loadMatrix();
    expect(problems).toEqual([]);
    for (const lang of ["zu", "st"] as const) {
      const all = tutorTiers(matrix, lang, { stt: "lelapa-vulavula", llm: "anthropic-claude", tts: DEV_PROVIDER }, () => true, true);
      expect(all.tier).toBe(1);
      expect(all.spokenQuestions).toBe(false);
      expect(all.generatedSpeech).toBe(false);
      const dev = tutorTiers(matrix, lang, { stt: DEV_PROVIDER, llm: DEV_PROVIDER, tts: DEV_PROVIDER }, () => true, true);
      expect(dev.tier).toBe(1);
    }
  });

  it("refuses the spoken question route when not verified, before any provider or limit is used", async () => {
    const d = deps({ matrix: loadMatrix().matrix });
    const transcribe = vi.spyOn(d.stt as SpeechToText, "transcribe");
    expect(await askTutor(d, input("say it again"))).toEqual({ outcome: "unavailable" });
    expect(transcribe).not.toHaveBeenCalled();
    expect(d.store.requests).toHaveLength(0);
  });

  describe("an unsafe or broken matrix disables every AI tier", () => {
    const dir = mkdtempSync(join(tmpdir(), "matrix-"));
    beforeEach(() => {
      process.env.CAPABILITY_MATRIX_PATH = join(dir, `m-${Math.random()}.json`);
    });
    afterEach(() => {
      delete process.env.CAPABILITY_MATRIX_PATH;
    });
    it("learner-visible but unverified", () => {
      const e = { ...verified("x", "zu", "stt"), status: "experimental" };
      writeFileSync(process.env.CAPABILITY_MATRIX_PATH!, JSON.stringify({ version: "bad", entries: [e] }));
      const { matrix, problems } = loadMatrix();
      expect(problems.join(" ")).toMatch(/learnerVisible but not verified/);
      expect(matrix.entries).toEqual([]);
    });
    it("malformed JSON", () => {
      writeFileSync(process.env.CAPABILITY_MATRIX_PATH!, "{");
      expect(loadMatrix().matrix.entries).toEqual([]);
    });
  });
});

describe("Tier 2: spoken questions answered with validated clips", () => {
  it("routes a help question to the tap-to-help option and logs text only, with an expiry", async () => {
    const d = deps();
    expect(await askTutor(d, input("please say it again slowly"))).toEqual({ outcome: "intent", intent: "slow" });
    expect(d.store.logs).toHaveLength(1);
    const log = d.store.logs[0];
    expect(log).toMatchObject({ learner_id: LEARNER, tier: 2, intent: "slow", generated: false, response_text: null, clip_id: null });
    expect(log.expires_at).toBe("2027-01-24T10:00:00.000Z");
    expect(JSON.stringify(d.store.logs)).not.toContain("DEVTEXT");
  });

  it("scrubs phone numbers and emails before the language model or the log sees them", async () => {
    const llm = new DevLanguageModel();
    const classify = vi.spyOn(llm, "classifyIntent");
    const d = deps({ llm });
    await askTutor(d, input("what does it mean? call me on 082 555 1234 or sipho@example.com"));
    const sent = classify.mock.calls[0][0];
    expect(sent.transcript).not.toMatch(/082|sipho/);
    expect(sent.transcript).toContain("[number]");
    expect(sent).not.toHaveProperty("learnerId");
    expect(d.store.logs[0].request_text).not.toMatch(/082|sipho/);
  });

  it("answers off-topic questions with the off-topic clip and does not log them for authors", async () => {
    const d = deps();
    expect(await askTutor(d, input("can you lend me money"))).toEqual({ outcome: "intent", intent: "off_topic" });
    expect(d.store.logs[0].clip_id).toBe("tutor.off_topic");
    expect(d.store.unanswered).toHaveLength(0);
  });

  it("logs unanswered questions for content authors without any learner identifier", async () => {
    const d = deps();
    expect(await askTutor(d, input("why is english spelling so strange"))).toEqual({ outcome: "intent", intent: "unknown" });
    expect(d.store.logs[0].clip_id).toBe("tutor.cant_answer_yet");
    expect(d.store.unanswered).toHaveLength(1);
    expect(JSON.stringify(d.store.unanswered[0])).not.toContain(LEARNER);
    expect(Object.keys(d.store.unanswered[0]).sort()).toEqual(["classified_intent", "exercise_id", "language", "lesson_id", "transcript"]);
  });

  it("rests when the learner's rate limit is reached, without calling providers", async () => {
    const d = deps({ store: new MemoryStore(5, 1) });
    await askTutor(d, input("again"));
    const transcribe = vi.spyOn(d.stt as SpeechToText, "transcribe");
    expect(await askTutor(d, input("again"))).toEqual({ outcome: "resting", reason: "rate_limited" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rests when the daily spending cap would be exceeded, without calling providers", async () => {
    const costly: SpeechToText = { id: DEV_PROVIDER, estimateCostUsd: () => 0.02, transcribe: vi.fn() };
    const d = deps({ stt: costly, store: new MemoryStore(0.01) });
    expect(await askTutor(d, input("again"))).toEqual({ outcome: "resting", reason: "spend_cap" });
    expect(costly.transcribe).not.toHaveBeenCalled();
    expect(d.store.spent).toBe(0);
  });

  it("settles the reservation to the real cost", async () => {
    const stt: SpeechToText = {
      id: DEV_PROVIDER,
      estimateCostUsd: () => 0.01,
      transcribe: async (_a, lang) => ({ text: "how do I do this", language: lang, costUsd: 0.004 }),
    };
    const llm: LanguageModel = { ...new DevLanguageModel(), id: DEV_PROVIDER, maxClassifyCostUsd: () => 0.03, classifyIntent: async () => ({ intent: "how", costUsd: 0.002 }), maxExplainCostUsd: () => 0, draftExplanation: vi.fn() };
    const d = deps({ stt, llm });
    await askTutor(d, input("x"));
    expect(d.store.spent).toBeCloseTo(0.006, 10);
  });

  it("rests on a provider failure, opens the breaker and keeps the reservation", async () => {
    const stt: SpeechToText = { id: DEV_PROVIDER, estimateCostUsd: () => 0.01, transcribe: async () => Promise.reject(new ProviderError(DEV_PROVIDER, "unavailable")) };
    const d = deps({ stt });
    expect(await askTutor(d, input("x"))).toEqual({ outcome: "resting", reason: "provider_error" });
    expect(d.health.failures).toEqual([DEV_PROVIDER]);
    expect(d.store.settled).toEqual([]);
    expect(d.store.spent).toBeCloseTo(0.01, 10);
  });

  it("rests when a provider does not answer in time", async () => {
    const stt: SpeechToText = { id: DEV_PROVIDER, estimateCostUsd: () => 0, transcribe: () => new Promise(() => {}) };
    const started = Date.now();
    expect(await askTutor(deps({ stt }), input("x"))).toEqual({ outcome: "resting", reason: "provider_error" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("never accepts a transcript in another language", async () => {
    const stt: SpeechToText = { id: DEV_PROVIDER, estimateCostUsd: () => 0, transcribe: async () => ({ text: "say it again", language: "st" as TeachingLang, costUsd: 0 }) };
    const d = deps({ stt });
    expect(await askTutor(d, input("x"))).toEqual({ outcome: "resting", reason: "provider_error" });
    expect(d.store.logs).toHaveLength(0);
  });
});

describe("Tier 3: generated speech only with a verified voice", () => {
  it("is not used when no voice is verified, even if one is configured", async () => {
    const d = deps({ tts: new DevTextToSpeech() });
    expect(await askTutor(d, input("why is english spelling so strange"))).toEqual({ outcome: "intent", intent: "unknown" });
  });

  it("speaks a drafted explanation for unanswered questions when everything is verified, logged as generated", async () => {
    const d = deps({ tts: new DevTextToSpeech() });
    d.matrix = { version: "t", entries: [...d.matrix.entries, verified(DEV_PROVIDER, "zu", "tts")] };
    const r = await askTutor(d, input("why is english spelling so strange"));
    expect(r.outcome).toBe("speech");
    expect(d.store.logs[0]).toMatchObject({ tier: 3, generated: true });
    expect(d.store.logs[0].response_text).toContain("development adapter");
  });

  it("still answers help questions with recordings, never generated speech", async () => {
    const d = deps({ tts: new DevTextToSpeech() });
    d.matrix = { version: "t", entries: [...d.matrix.entries, verified(DEV_PROVIDER, "zu", "tts")] };
    expect(await askTutor(d, input("what does it mean"))).toEqual({ outcome: "intent", intent: "meaning" });
  });
});

describe("development adapter", () => {
  it("classifies deterministically in English, isiZulu and Sesotho", () => {
    expect(devClassify("Ngicela uyiphinde futhi")).toBe("replay");
    expect(devClassify("Bua butle hle")).toBe("slow");
    expect(devClassify("lento isho ukuthini, kusho ukuthini")).toBe("meaning");
    expect(devClassify("")).toBe("unknown");
    expect(devClassify("tell me about football")).toBe("off_topic");
  });
  it("transcribes real audio to nothing", async () => {
    const t = await new DevSpeechToText().transcribe(new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]), "st");
    expect(t.text).toBe("");
  });
});

describe("Anthropic adapter", () => {
  const ctx = input("x").context;
  function fakeClient(reply: Partial<{ stop_reason: string; parsed_output: unknown; usage: unknown }> | Error) {
    const parse = vi.fn(async () => {
      if (reply instanceof Error) throw reply;
      return { stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 50 }, ...reply };
    });
    return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
  }

  it("asks for one intent from the fixed list, with low effort, refusal fallback and only a pseudonym", async () => {
    const { client, parse } = fakeClient({ parsed_output: { intent: "meaning" } });
    const llm = new AnthropicLanguageModel("claude-opus-5-5", 5000, client);
    const r = await llm.classifyIntent({ transcript: "kusho ukuthini", lang: "zu", context: ctx, pseudonym: "l_abc" }, new AbortController().signal);
    expect(r.intent).toBe("meaning");
    expect(r.costUsd).toBeCloseTo((1000 * 4 + 50 * 20) / 1e6, 10);
    const [params] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"], metadata: { user_id: "l_abc" } });
    expect((params.output_config as { effort: string; format: { type: string } }).effort).toBe("low");
    expect((params.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("tool_choice");
    expect(params).not.toHaveProperty("thinking");
    expect(JSON.stringify(params.messages)).toContain("kusho ukuthini");
  });

  it("does not send the fallback parameter for models that do not take it", async () => {
    const { client, parse } = fakeClient({ parsed_output: { intent: "how" } });
    await new AnthropicLanguageModel("claude-haiku-5-5", 5000, client).classifyIntent({ transcript: "x", lang: "st", context: ctx, pseudonym: "p" }, new AbortController().signal);
    expect((parse.mock.calls[0] as unknown as [object])[0]).not.toHaveProperty("fallbacks");
  });

  it("treats a refusal or an unparseable reply as 'cannot answer yet'", async () => {
    for (const reply of [{ stop_reason: "refusal", parsed_output: null }, { stop_reason: "max_tokens", parsed_output: null }]) {
      const { client } = fakeClient(reply);
      const r = await new AnthropicLanguageModel("claude-opus-5-5", 5000, client).classifyIntent({ transcript: "x", lang: "zu", context: ctx, pseudonym: "p" }, new AbortController().signal);
      expect(r.intent).toBe("unknown");
    }
  });

  it("maps SDK errors to provider errors", async () => {
    const cases: [Error, string][] = [
      [new Anthropic.RateLimitError(429, {}, "slow down", new Headers()), "rate_limited"],
      [new Anthropic.AuthenticationError(401, {}, "bad key", new Headers()), "auth"],
      [new Anthropic.APIConnectionTimeoutError(), "timeout"],
      [new Anthropic.APIConnectionError({ message: "offline" }), "unavailable"],
      [new Anthropic.InternalServerError(529, {}, "overloaded", new Headers()), "unavailable"],
    ];
    for (const [err, code] of cases) {
      const { client } = fakeClient(err);
      await expect(
        new AnthropicLanguageModel("claude-opus-5-5", 5000, client).classifyIntent({ transcript: "x", lang: "zu", context: ctx, pseudonym: "p" }, new AbortController().signal),
      ).rejects.toMatchObject({ code });
    }
  });

  it("prices fallback attempts at the fallback model's rates and cached input at a tenth", () => {
    const cost = responseCostUsd("claude-opus-5-5", {
      input_tokens: 10,
      output_tokens: 10,
      iterations: [
        { type: "message", input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 1000 },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1000, output_tokens: 100 },
      ],
    });
    expect(cost).toBeCloseTo((1000 * 4 + 100 * 4) / 1e6 + (1000 * 5 + 100 * 25) / 1e6, 10);
  });

  it("reserves enough for the worst case", () => {
    const llm = new AnthropicLanguageModel("claude-opus-5-5", 5000, fakeClient({}).client);
    expect(llm.maxClassifyCostUsd()).toBeGreaterThan((1500 * 4 + 1024 * 20) / 1e6);
    expect(new AnthropicLanguageModel("some-future-model", 5000, fakeClient({}).client).maxClassifyCostUsd()).toBeGreaterThan(llm.maxClassifyCostUsd() / 2.5);
  });
});

describe("Vulavula adapter", () => {
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
  const call = (body: unknown, status = 200) => {
    const doFetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    return { stt: new VulavulaSpeechToText("key-123", 0.1, 10, "https://vv.test", doFetch as unknown as typeof fetch), doFetch };
  };

  it("posts the file with the language code and token, and reads the transcript", async () => {
    const { stt, doFetch } = call({ transcription_text: " ngicela uphinde ", language_code: "zul" });
    const t = await stt.transcribe(audio, "zu", new AbortController().signal);
    expect(t).toMatchObject({ text: "ngicela uphinde", language: "zu" });
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vv.test/api/v2alpha/transcribe/sync/file?lang_code=zul");
    expect((init.headers as Record<string, string>)["X-CLIENT-TOKEN"]).toBe("key-123");
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("rejects a transcript in another language", async () => {
    const { stt } = call({ transcription_text: "hello", language_code: "eng" });
    await expect(stt.transcribe(audio, "st", new AbortController().signal)).rejects.toMatchObject({ code: "wrong_language" });
  });

  it("reports rate limits, auth problems and malformed replies", async () => {
    await expect(call({}, 429).stt.transcribe(audio, "zu", new AbortController().signal)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(call({}, 401).stt.transcribe(audio, "zu", new AbortController().signal)).rejects.toMatchObject({ code: "auth" });
    await expect(call({ text: "x" }).stt.transcribe(audio, "zu", new AbortController().signal)).rejects.toMatchObject({ code: "bad_response" });
    await expect(new VulavulaSpeechToText("", 0.1, 10).transcribe(audio, "zu", new AbortController().signal)).rejects.toMatchObject({ code: "auth" });
  });
});

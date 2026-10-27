"use client";

import { useEffect, useState } from "react";
import type { CompiledStep, Lang } from "@/lib/content/compiled";
import { clipForResult, isHelpIntent, type HelpIntent, type TutorAskResult } from "@/lib/tutor/intents";
import { track } from "../analytics";
import { accessToken } from "../offline/auth";
import { useOnline } from "../offline/network";
import { useLearner } from "../state";
import { IconMic, IconStop } from "../ui/icons";
import { Caption, Spinner } from "../ui/kit";
import { useSpeech } from "../ui/speech";
import { useRecorderBlob } from "./useRecorderBlob";

export interface TutorTiersClient {
  spokenQuestions: boolean;
  generatedSpeech: boolean;
}

/**
 * Which tutor tiers the server reports as verified for this language. Only
 * ever true when the capability matrix marks the needed providers verified
 * and visible to learners; offline it is always Tier 1.
 */
export function useTutorTiers(lang: Lang | null): TutorTiersClient {
  const online = useOnline();
  const [reported, setReported] = useState<{ lang: Lang; tiers: TutorTiersClient } | null>(null);
  useEffect(() => {
    if (!lang || !online) return;
    let cancelled = false;
    fetch(`/api/tutor/capabilities?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setReported({ lang, tiers: { spokenQuestions: !!d?.spokenQuestions, generatedSpeech: !!d?.generatedSpeech } });
      })
      .catch(() => !cancelled && setReported(null));
    return () => {
      cancelled = true;
    };
  }, [lang, online]);
  return lang && online && reported?.lang === lang ? reported.tiers : NO_TIERS;
}

const NO_TIERS: TutorTiersClient = { spokenQuestions: false, generatedSpeech: false };

/**
 * Tier 2: the learner asks a question aloud. The audio goes to the server
 * once, is transcribed by a verified provider and discarded. A question that
 * matches a help option is answered exactly as if that option had been
 * tapped (same recordings, same honesty rule); anything else gets a fixed
 * recorded reply. Tier 3 generated speech plays only when the server reports
 * a verified voice, and always marks the attempt as supported.
 */
export function TutorAsk({
  lang,
  lessonId,
  step,
  onIntent,
  onSupported,
  onDone,
}: {
  lang: Lang;
  lessonId: string;
  step: CompiledStep;
  /** Answer a help intent with the matching tap-to-help option; false when that help is not available here. */
  onIntent: (intent: HelpIntent) => Promise<boolean>;
  onSupported: () => void;
  onDone: () => void;
}) {
  const { clip, profile } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const rec = useRecorderBlob(8000);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    void speak({ line: clip(online ? "tutor.ask_prompt" : "tutor.needs_internet"), lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rec.blob || !profile) return;
    const blob = rec.blob;
    rec.reset();
    void (async () => {
      setBusy(true);
      let result: TutorAskResult = { outcome: "resting", reason: "provider_error" };
      try {
        const token = await accessToken(profile.id);
        const form = new FormData();
        form.set("audio", blob, "question.webm");
        form.set("lang", lang);
        form.set("lessonId", lessonId);
        form.set("stepId", step.id);
        const res = await fetch("/api/tutor/ask", { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (res.ok) result = (await res.json()) as TutorAskResult;
        else void track("provider_failure", { status: res.status, tier: 2 }, profile.id);
      } catch {
        // Network failure: answered as "resting" below.
      }
      try {
        if (result.outcome === "intent" && isHelpIntent(result.intent)) {
          if (!(await onIntent(result.intent))) await speak({ line: clip("tutor.cant_answer_yet"), lang });
        } else if (result.outcome === "speech") {
          if (step.kind === "exercise") onSupported();
          setGenerated(true);
          await speak({ audio: { src: `data:${result.mime};base64,${result.audio}`, ms: 0, bytes: result.audio.length, placeholder: false, lang }, lang });
          setGenerated(false);
        } else {
          await speak({ line: clip(clipForResult(result) ?? "tutor.cant_answer_yet"), lang });
        }
        // Help intents are tracked by the help panel, like a tap.
        if (!(result.outcome === "intent" && isHelpIntent(result.intent))) {
          void track("tutor_help", { option: result.outcome === "intent" ? result.intent : result.outcome, tier: result.outcome === "speech" ? 3 : 2, lessonId }, profile.id);
        }
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.blob]);

  if (!online) {
    return (
      <div className="flex flex-col gap-4">
        <Caption line={clip("tutor.needs_internet")} />
        <button type="button" onClick={onDone} className="min-h-14 rounded-2xl bg-primary text-white">
          OK
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-5" data-testid="tutor-ask">
      <Caption line={clip("tutor.ask_prompt")} />
      {generated && (
        <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent" data-testid="ai-voice">
          AI
        </span>
      )}
      {busy ? (
        <Spinner />
      ) : (
        <button
          type="button"
          data-testid="ask-record"
          aria-label="ask"
          onClick={() => (rec.recording ? rec.stop() : void rec.start())}
          className={`flex h-28 w-28 items-center justify-center rounded-full text-white ${rec.recording ? "pulse-ring bg-danger" : "bg-primary"}`}
        >
          {rec.recording ? <IconStop size={52} /> : <IconMic size={52} />}
        </button>
      )}
      <button type="button" onClick={onDone} className="min-h-12 w-full rounded-2xl border-2 border-line text-lg font-semibold">
        ←
      </button>
    </div>
  );
}

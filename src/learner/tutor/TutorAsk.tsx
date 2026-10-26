"use client";

import { useEffect, useState } from "react";
import type { CompiledLex, CompiledStep, Lang } from "@/lib/content/compiled";
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
 * once, is transcribed by a verified provider and discarded; the answer is
 * always a validated recorded clip.
 */
export function TutorAsk({
  lang,
  lessonId,
  step,
  lex,
  onDone,
}: {
  lang: Lang;
  lessonId: string;
  step: CompiledStep;
  lex: Record<string, CompiledLex>;
  onDone: () => void;
}) {
  const { clip, profile } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const rec = useRecorderBlob(8000);
  const [busy, setBusy] = useState(false);

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
      try {
        const token = await accessToken(profile.id);
        const form = new FormData();
        form.set("audio", blob, "question.webm");
        form.set("lang", lang);
        form.set("lessonId", lessonId);
        form.set("stepId", step.id);
        const res = await fetch("/api/tutor/ask", { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const data = res.ok ? ((await res.json()) as { clipId: string; replay?: "instruction" | "teach"; lexId?: string }) : { clipId: "tutor.resting" };
        await speak({ line: clip(data.clipId), lang });
        if (data.replay === "instruction" && step.kind === "exercise") await speak({ line: step.instruction, lang });
        if (data.replay === "teach" && step.kind === "teach") await speak({ line: step.line, lang });
        if (data.lexId && lex[data.lexId]?.gloss) await speak({ line: lex[data.lexId].gloss!.line, lang });
        if (!res.ok) void track("provider_failure", { status: res.status, tier: 2 }, profile.id);
      } catch {
        await speak({ line: clip("tutor.resting"), lang });
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

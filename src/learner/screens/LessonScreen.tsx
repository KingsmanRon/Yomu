"use client";

import { useEffect, useState } from "react";
import type { CompiledLesson } from "@/lib/content/compiled";
import { track } from "../analytics";
import { ContentUnavailableError, lessonUrl, loadLesson } from "../content";
import { LessonPlayer } from "../lesson/LessonPlayer";
import { useConnection } from "../offline/network";
import { formatBytes, isCached } from "../offline/packs";
import { usePath } from "../progress";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconClose, IconContinue, IconMobileData, IconOffline, IconWifi } from "../ui/icons";
import { Caption, Screen, SpeakButton, Spinner } from "../ui/kit";
import { useSpeech } from "../ui/speech";

export interface LessonDoneState {
  lessonId: string;
  correct: number;
  total: number;
  xpBefore: number;
  badgesBefore: string[];
}

/**
 * Opens a lesson. If the lesson is not on the phone yet, says so and shows
 * the download size (and whether it would use mobile data) before fetching.
 */
export function LessonScreen({ lessonId }: { lessonId: string }) {
  const { lang, line, profile, derived, catalog, record, syncNow } = useLearner();
  const { speak } = useSpeech();
  const path = usePath();
  const connection = useConnection();
  const [lesson, setLesson] = useState<CompiledLesson | null>(null);
  const [gate, setGate] = useState<"checking" | "ask" | "offline" | "ready">("checking");

  const info = catalog?.lessons.find((l) => l.id === lessonId);
  const availability = path?.availability[lessonId];

  useEffect(() => {
    if (!lang || !info) return;
    let cancelled = false;
    (async () => {
      const cached = await isCached(lessonUrl(lang, lessonId));
      if (cancelled) return;
      if (cached || connection === "wifi") setGate("ready");
      else if (connection === "offline") setGate("offline");
      else setGate("ask");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, lessonId, info?.id]);

  useEffect(() => {
    if (gate === "offline" && lang) void speak({ line: line("sys.offline") ?? null, lang });
    if (gate === "ask" && lang) void speak({ line: line("sys.uses_data") ?? null, lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  useEffect(() => {
    if (gate !== "ready" || !lang) return;
    loadLesson(lang, lessonId)
      .then(setLesson)
      .catch((e) => {
        if (e instanceof ContentUnavailableError) setGate("offline");
      });
  }, [gate, lang, lessonId]);

  useEffect(() => {
    if (lesson && profile) void track("lesson_start", { lessonId, level: lesson.level }, profile.id);
  }, [lesson, lessonId, profile]);

  const blocked = !!(lang && catalog && path) && (!info || !info.available[lang!] || availability === "locked");
  useEffect(() => {
    if (!blocked) return;
    if (availability === "locked" && lang) void speak({ line: line("path.locked"), lang });
    navigate("/path", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  if (!lang || !profile || !derived || !catalog || !path || !info) return <Spinner />;
  if (blocked) return null;

  if (gate === "offline")
    return (
      <Screen label="lesson not downloaded" className="items-center justify-center gap-6 text-center">
        <IconOffline size={96} className="text-ink-soft" />
        <Caption line={line("sys.needs_download") ?? null} always className="items-center" />
        <SpeakButton testId="back-home" speech={line("ui.back")} onClick={() => navigate("/home")} className="w-full">
          <IconClose size={32} />
        </SpeakButton>
      </Screen>
    );

  if (gate === "ask")
    return (
      <Screen label="download lesson" className="items-center justify-center gap-6 text-center">
        {connection === "mobile" ? <IconMobileData size={96} className="text-accent" /> : <IconWifi size={96} className="text-primary" />}
        <p className="text-4xl font-extrabold" data-testid="download-size">
          {formatBytes(info.bytes[lang])}
        </p>
        <Caption line={line(profile.settings.wifiOnly && connection === "mobile" ? "sys.waiting_wifi" : "sys.uses_data") ?? null} always className="items-center" />
        <div className="grid w-full grid-cols-2 gap-3">
          <SpeakButton testId="download-cancel" variant="secondary" speech={line("ui.back")} onClick={() => navigate("/home")}>
            <IconClose size={32} />
          </SpeakButton>
          <SpeakButton testId="download-continue" speech={line("downloads.download")} onClick={() => setGate("ready")}>
            <IconContinue size={32} />
          </SpeakButton>
        </div>
      </Screen>
    );

  if (!lesson) return <Spinner />;

  const resume = path.recommended?.lessonId === lessonId ? path.recommended.resumeStep : 0;
  return (
    <LessonPlayer
      items={lesson.steps.map((step) => ({ step, lessonId, lex: lesson.lex }))}
      lang={lang}
      mode="lesson"
      startIndex={resume}
      intro={lesson.intro}
      outro={lesson.outro}
      review={lesson.review}
      onExit={() => {
        void track("lesson_exit", { lessonId }, profile.id);
        navigate("/home");
      }}
      onFinish={async (r) => {
        const state: LessonDoneState = {
          lessonId,
          correct: r.correct,
          total: r.total,
          xpBefore: derived.xp,
          badgesBefore: Object.keys(derived.badges),
        };
        await record("lesson_complete", { lessonId, correct: r.correct, total: r.total, durationMs: r.durationMs, dataBytes: r.dataBytes });
        void track("lesson_complete", { lessonId, correct: r.correct, total: r.total, minutes: Math.round(r.durationMs / 60000), dataKb: Math.round((r.dataBytes ?? 0) / 1024) }, profile.id);
        try {
          sessionStorage.setItem("yomu:lessonDone", JSON.stringify(state));
        } catch {
          // Storage unavailable: the completion screen still shows totals.
        }
        void syncNow();
        navigate(`/lesson/${lessonId}/done`, { replace: true });
      }}
    />
  );
}

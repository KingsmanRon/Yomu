"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog, CompiledLesson } from "@/lib/content/compiled";

/**
 * Developer tutor lab. Type a question (sent to the development speech
 * adapter as text) or record one (for a real speech provider), and see the
 * transcript, the intent, what the learner would hear and the cost.
 */
export function TutorLab() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [lang, setLang] = useState<"zu" | "st">("zu");
  const [lessonId, setLessonId] = useState("");
  const [lesson, setLesson] = useState<CompiledLesson | null>(null);
  const [stepId, setStepId] = useState("");
  const [question, setQuestion] = useState("");
  const [draft, setDraft] = useState(false);
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorded = useRef<Blob | null>(null);

  useEffect(() => {
    fetch("/content/catalog.json")
      .then((r) => r.json())
      .then((c: Catalog) => {
        setCatalog(c);
        setLessonId(c.lessons[0]?.id ?? "");
      });
  }, []);

  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    fetch(`/content/lessons/${lang}/${lessonId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((l: CompiledLesson | null) => {
        if (cancelled) return;
        setLesson(l);
        setStepId(l?.steps.find((s) => s.kind === "exercise")?.id ?? l?.steps[0]?.id ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [lang, lessonId]);

  const run = async (audio: Blob) => {
    setBusy(true);
    setResult("");
    const form = new FormData();
    form.set("lang", lang);
    form.set("lessonId", lessonId);
    form.set("stepId", stepId);
    form.set("draft", String(draft));
    form.set("audio", audio, "question");
    try {
      const res = await fetch("/api/dev/tutor-lab", { method: "POST", body: form });
      setResult(JSON.stringify(await res.json(), null, 2));
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    recorder.current = r;
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      recorded.current = new Blob(chunks, { type: r.mimeType });
      void run(recorded.current);
    };
    r.start();
    setRecording(true);
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 font-sans">
      <h1 className="text-2xl font-bold">Tutor lab</h1>
      <p className="rounded-xl bg-accent-soft p-3 text-sm">
        Developer tool. Runs the configured AI providers whether or not the capability matrix has verified them, so it is never shown to learners and is
        absent in production. Nothing is stored; paid providers count against the daily spending cap. Drafts are AI-generated and unverified.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-sm font-semibold">
          Language
          <select value={lang} onChange={(e) => setLang(e.target.value as "zu" | "st")} className="rounded border p-2 font-normal" data-testid="lab-lang">
            <option value="zu">isiZulu</option>
            <option value="st">Sesotho</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-semibold">
          Lesson
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="rounded border p-2 font-normal" data-testid="lab-lesson">
            {catalog?.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id}: {l.title.en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-semibold">
          Step
          <select value={stepId} onChange={(e) => setStepId(e.target.value)} className="rounded border p-2 font-normal" data-testid="lab-step">
            {lesson?.steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ({s.kind === "exercise" ? s.type : s.teach})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col text-sm font-semibold">
        Question as text (for the development speech adapter)
        <input value={question} onChange={(e) => setQuestion(e.target.value)} className="rounded border p-2 font-normal" data-testid="lab-question" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Also draft a Tier 3 explanation
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy || !question.trim() || !stepId}
          onClick={() => void run(new Blob([`DEVTEXT:${question}`], { type: "text/plain" }))}
          className="rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-40"
          data-testid="lab-run"
        >
          Run text
        </button>
        <button type="button" disabled={busy || !stepId} onClick={() => void toggleRecording()} className="rounded-xl border-2 px-4 py-2 font-bold">
          {recording ? "Stop and run" : "Record audio"}
        </button>
      </div>
      <pre className="overflow-auto rounded-xl bg-white p-3 text-xs" data-testid="lab-result">
        {busy ? "Running…" : result}
      </pre>
    </main>
  );
}

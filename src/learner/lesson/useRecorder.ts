"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records the learner saying a word, for self-check against the model.
 * The recording exists only in this tab's memory: it is never uploaded and
 * never saved, and it is discarded as soon as the item is finished or the
 * component closes.
 */
export function useRecorder(maxMs = 4000) {
  const [state, setState] = useState<"idle" | "recording" | "ready" | "unavailable">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  const discard = useCallback(() => {
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setState("idle");
  }, []);

  useEffect(
    () => () => {
      release();
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    },
    [release],
  );

  const start = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    try {
      discard();
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const chunks: Blob[] = [];
      const r = new MediaRecorder(s);
      recorder.current = r;
      r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      r.onstop = () => {
        release();
        setUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType || "audio/webm" })));
        setState("ready");
      };
      r.start();
      setState("recording");
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), maxMs);
    } catch {
      release();
      setState("unavailable");
    }
  }, [discard, maxMs, release]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const playBack = useCallback(async () => {
    if (!url) return;
    const a = new Audio(url);
    await new Promise<void>((resolve) => {
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }, [url]);

  return { state, start, stop, playBack, discard };
}

/** Ask for microphone permission (only after the spoken explanation). */
export async function requestMicrophone(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

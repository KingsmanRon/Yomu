"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Record a short spoken question into memory (sent once to the tutor, never stored). */
export function useRecorderBlob(maxMs: number) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      recorder.current = r;
      r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      r.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBlob(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      };
      r.start();
      setRecording(true);
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), maxMs);
    } catch {
      setRecording(false);
    }
  }, [maxMs]);

  const reset = useCallback(() => setBlob(null), []);
  return { recording, blob, start, stop, reset };
}

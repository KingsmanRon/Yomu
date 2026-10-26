"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { AudioLang, CompiledAudio, CompiledLine } from "@/lib/content/compiled";
import { player, type PlayRequest, type PlayResult } from "../audio/player";

/** Something that can be spoken: a compiled line (teaching language) or a raw request. */
export type Speakable =
  | { line: CompiledLine | null | undefined; lang: AudioLang; rate?: number }
  | { audio: CompiledAudio | null | undefined; lang: AudioLang; rate?: number; key?: string };

export function toRequest(s: Speakable): PlayRequest {
  if ("line" in s) return { audio: s.line?.audio, expect: s.lang, rate: s.rate, key: s.line?.id };
  return { audio: s.audio, expect: s.lang, rate: s.rate, key: s.key ?? s.audio?.src };
}

function subscribe(cb: () => void) {
  return player.subscribe(cb);
}

/** The key of what is playing now (a line ID or audio URL), for captions and highlights. */
export function usePlaying(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => player.playingKey,
    () => null,
  );
}

/**
 * Speak lines and stop when the component unmounts. Returns a stable
 * `speak` that plays items in order.
 */
export function useSpeech() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      player.stop();
    };
  }, []);
  const speak = useCallback(async (...items: Speakable[]): Promise<PlayResult> => {
    if (!mounted.current) return "stopped";
    return player.sequence(items.map(toRequest));
  }, []);
  const stop = useCallback(() => player.stop(), []);
  return { speak, stop };
}

/** Speak once when the screen opens (after the first user gesture, autoplay is allowed). */
export function useSpeakOnMount(items: Speakable[] | null, deps: unknown[]): void {
  const { speak } = useSpeech();
  useEffect(() => {
    if (!items || items.length === 0) return;
    const t = setTimeout(() => void speak(...items), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

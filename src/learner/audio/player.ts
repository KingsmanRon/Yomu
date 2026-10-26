import type { AudioLang, CompiledAudio } from "@/lib/content/compiled";

/**
 * Which file the player may use for an audio asset, or null when none.
 *
 * Language guard: the asset must be in the language the caller expects.
 * A missing isiZulu or Sesotho recording is never replaced by audio in
 * another language (in particular, never by English); the caller shows the
 * caption and an honest "no recording yet" state instead.
 */
export function playableSource(
  audio: CompiledAudio | null | undefined,
  expected: AudioLang,
  canPlay: { opus: boolean; aac: boolean },
): string | null {
  if (!audio) return null;
  if (audio.lang !== expected) return null;
  if (canPlay.opus) return audio.src;
  if (canPlay.aac && audio.srcAac) return audio.srcAac;
  return null;
}

export type PlayResult = "ended" | "stopped" | "unavailable" | "blocked" | "error";

export interface PlayRequest {
  audio: CompiledAudio | null | undefined;
  expect: AudioLang;
  /** Playback rate; 0.7 for "listen slowly" (pitch preserved). */
  rate?: number;
  /** Identifier shown as "now playing" (for captions and highlighting). */
  key?: string;
}

type Listener = (playingKey: string | null) => void;

class Player {
  private el: HTMLAudioElement | null = null;
  private finish: ((r: PlayResult) => void) | null = null;
  private listeners = new Set<Listener>();
  private urls = new Map<string, string>();
  private formats: { opus: boolean; aac: boolean } | null = null;
  playingKey: string | null = null;

  private element(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
    }
    return this.el;
  }

  supported(): { opus: boolean; aac: boolean } {
    if (!this.formats) {
      const el = this.element();
      this.formats = {
        opus: el.canPlayType('audio/ogg; codecs="opus"') !== "",
        aac: el.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== "",
      };
    }
    return this.formats;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setPlaying(key: string | null) {
    this.playingKey = key;
    for (const l of this.listeners) l(key);
  }

  /** Fetch through the service worker cache and keep a blob URL, so replays cost no data. */
  private async blobUrl(src: string): Promise<string> {
    const cached = this.urls.get(src);
    if (cached) return cached;
    const res = await fetch(src);
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    this.urls.set(src, url);
    if (this.urls.size > 120) {
      const [oldSrc, oldUrl] = this.urls.entries().next().value as [string, string];
      URL.revokeObjectURL(oldUrl);
      this.urls.delete(oldSrc);
    }
    return url;
  }

  stop(): void {
    const el = this.el;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
    const f = this.finish;
    this.finish = null;
    this.setPlaying(null);
    f?.("stopped");
  }

  async play(req: PlayRequest): Promise<PlayResult> {
    this.stop();
    const src = playableSource(req.audio, req.expect, this.supported());
    if (!src) return "unavailable";
    let url: string;
    try {
      url = await this.blobUrl(src);
    } catch {
      return "error";
    }
    const el = this.element();
    return new Promise<PlayResult>((resolve) => {
      this.finish = resolve;
      el.onended = () => {
        if (this.finish === resolve) {
          this.finish = null;
          this.setPlaying(null);
          resolve("ended");
        }
      };
      el.onerror = () => {
        if (this.finish === resolve) {
          this.finish = null;
          this.setPlaying(null);
          resolve("error");
        }
      };
      el.src = url;
      el.playbackRate = req.rate ?? 1;
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      this.setPlaying(req.key ?? src);
      el.play().catch((e: unknown) => {
        if (this.finish === resolve) {
          this.finish = null;
          this.setPlaying(null);
          resolve((e as Error)?.name === "NotAllowedError" ? "blocked" : "error");
        }
      });
    });
  }

  /** Play several items in order; stops at the first item that is stopped or blocked. */
  async sequence(items: PlayRequest[], gapMs = 250): Promise<PlayResult> {
    let last: PlayResult = "ended";
    for (const item of items) {
      last = await this.play(item);
      if (last === "stopped" || last === "blocked") return last;
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    }
    return last;
  }
}

export const player = new Player();

/**
 * Sound check tone (language-neutral): two soft beeps generated on the
 * device, so it works before any language has been chosen and costs no data.
 */
export async function playSoundCheckTone(): Promise<boolean> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    for (const [i, f] of [523.25, 659.25, 783.99].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t0 + i * 0.35);
      gain.gain.linearRampToValueAtTime(0.3, t0 + i * 0.35 + 0.04);
      gain.gain.linearRampToValueAtTime(0, t0 + i * 0.35 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * 0.35);
      osc.stop(t0 + i * 0.35 + 0.32);
    }
    await new Promise((r) => setTimeout(r, 1200));
    await ctx.close();
    return true;
  } catch {
    return false;
  }
}

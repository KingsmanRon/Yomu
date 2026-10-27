import { collectAudioAssets } from "@/lib/content/assets";
import { compileContent, type AudioIndexLike, type CompileOutput } from "@/lib/content/compile";
import { loadContent } from "@/lib/content/load";

let cached: CompileOutput | null = null;

/**
 * The real curriculum compiled in memory, with a stand-in audio index (every
 * spoken line gets a fake placeholder file), so tests exercise actual lesson
 * content without running the audio build.
 */
export function compiledContent(): CompileOutput {
  if (cached) return cached;
  const { bundle, errors } = loadContent();
  if (!bundle) throw new Error(`content did not load: ${errors.join("; ")}`);
  const audio = new Map<string, AudioIndexLike>();
  for (const a of collectAudioAssets(bundle)) {
    audio.set(a.id, { id: a.id, lang: a.lang, src: `/audio/test/${a.id}.ogg`, bytes: 1000, ms: 1000, placeholder: true });
  }
  cached = compileContent({
    bundle,
    audio,
    imageBytes: () => 1000,
    contentVersion: "test",
    builtAt: "2026-01-01T00:00:00.000Z",
    hideUnapproved: false,
    precacheLessons: [],
    precacheBudgetBytes: Number.MAX_SAFE_INTEGER,
    shellUrls: [],
    precacheAppLine: () => false,
  });
  if (cached.errors.length > 0) throw new Error(`content did not compile: ${cached.errors.slice(0, 5).join("; ")}`);
  return cached;
}

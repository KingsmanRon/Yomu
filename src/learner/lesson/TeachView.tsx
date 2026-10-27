"use client";

import { useEffect, useState } from "react";
import type { CompiledLex, CompiledTeachStep, Lang } from "@/lib/content/compiled";
import { player } from "../audio/player";
import { Caption, Picture } from "../ui/kit";
import { useSpeech, type Speakable } from "../ui/speech";
import { ReadingText } from "./parts";

/** What a teaching step plays: its explanation, then the letter, word or meaning it introduces. */
export function teachSequence(step: CompiledTeachStep, lex: Record<string, CompiledLex>, lang: Lang): Speakable[] {
  const items: Speakable[] = [{ line: step.line, lang }];
  const l = step.lex ? lex[step.lex] : undefined;
  if (!l) return items;
  if (step.teach === "letter_intro") {
    items.push({ audio: l.audio, lang: l.lang }, { audio: l.audio, lang: l.lang });
    const anchor = step.anchor ? lex[step.anchor] : undefined;
    if (anchor) items.push({ audio: anchor.audio, lang: anchor.lang });
  } else if (step.teach === "word_intro") {
    items.push({ audio: l.audio, lang: l.lang });
    if (l.gloss) items.push({ line: l.gloss.line, lang });
  } else if (step.teach !== "blend_demo") {
    items.push({ audio: l.audio, lang: l.lang });
  }
  return items;
}

/** Blending demonstration: each sound lights up as it plays, then the whole word. */
async function playBlend(l: CompiledLex, onIndex: (i: number) => void) {
  const parts = l.graphemes ?? [];
  for (let i = 0; i < parts.length; i++) {
    onIndex(i);
    const a = l.graphemeAudio?.[i];
    if (a) await player.play({ audio: a, expect: a.lang, rate: 0.85 });
    else await new Promise((r) => setTimeout(r, 600));
    await new Promise((r) => setTimeout(r, 250));
  }
  onIndex(parts.length);
  await player.play({ audio: l.audio, expect: l.lang, rate: 0.8 });
  await new Promise((r) => setTimeout(r, 300));
  await player.play({ audio: l.audio, expect: l.lang });
}

export function TeachView({
  step,
  lex,
  lang,
  setReplay,
}: {
  step: CompiledTeachStep;
  lex: Record<string, CompiledLex>;
  lang: Lang;
  setReplay: (fn: () => void) => void;
}) {
  const { speak } = useSpeech();
  const [blendIndex, setBlendIndex] = useState(-1);
  const l = step.lex ? lex[step.lex] : undefined;

  useEffect(() => {
    const run = async () => {
      const r = await speak(...teachSequence(step, lex, lang));
      if (step.teach === "blend_demo" && l && r !== "stopped") await playBlend(l, setBlendIndex);
    };
    setReplay(() => {
      setBlendIndex(-1);
      void run();
    });
    const t = setTimeout(() => void run(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  return (
    <div className="flex flex-col items-center gap-5 text-center" data-testid={`teach-${step.teach}`}>
      {step.teach === "letter_intro" && l && (
        <div className="flex flex-col items-center gap-3">
          <span lang={l.lang} className="reading-text flex h-44 w-44 items-center justify-center rounded-3xl bg-white text-9xl font-bold shadow-sm">
            {l.text}
          </span>
          {step.anchor && lex[step.anchor]?.image && <Picture src={lex[step.anchor].image} className="h-24 w-24" />}
        </div>
      )}
      {step.teach === "word_intro" && l && (
        <div className="flex flex-col items-center gap-3">
          {l.image && <Picture src={l.image} className="h-44 w-44" />}
          <ReadingText>{l.text}</ReadingText>
          {l.gloss && (
            <p className="text-xl font-semibold text-ink-soft" lang={lang}>
              = {l.gloss.word}
            </p>
          )}
        </div>
      )}
      {step.teach === "blend_demo" && l && (
        <div className="flex flex-col items-center gap-4">
          {l.image && <Picture src={l.image} className="h-32 w-32" />}
          <div className="flex items-end gap-2" lang="en" aria-label={l.text}>
            {(l.graphemes ?? [l.text]).map((g, i) => (
              <span
                key={i}
                className={`reading-text rounded-2xl px-3 py-2 text-6xl font-bold transition ${
                  blendIndex === i ? "scale-110 bg-primary text-white" : blendIndex >= (l.graphemes?.length ?? 1) ? "bg-good-soft text-good" : "bg-white"
                }`}
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}
      {(step.teach === "explain" || step.teach === "contrast_note") && (
        <div className="flex flex-col items-center gap-3">
          {step.showImage && <Picture src={step.showImage} className="h-40 w-40" />}
          {l && l.image && <Picture src={l.image} className="h-32 w-32" />}
          {step.showText && <ReadingText size="lg">{step.showText}</ReadingText>}
          {l && <ReadingText size={l.kind === "sentence" ? "lg" : "xl"}>{l.text}</ReadingText>}
        </div>
      )}
      <Caption line={step.line} className="items-center" />
    </div>
  );
}

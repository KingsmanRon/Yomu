"use client";

import { useState } from "react";
import type { CompiledLex, CompiledStep, Lang } from "@/lib/content/compiled";
import { track } from "../analytics";
import { useOnline } from "../offline/network";
import { useLearner } from "../state";
import { helpOptions, helpSequence, type HelpId, type HelpItem } from "../tutor/tier1";
import { IconHelp, IconLanguage, IconListen, IconMic, IconSlow, IconText } from "../ui/icons";
import { Caption, Modal } from "../ui/kit";
import { useSpeech, type Speakable } from "../ui/speech";
import { TutorAsk } from "../tutor/TutorAsk";

const ICONS: Record<HelpId, React.ReactNode> = {
  replay: <IconListen size={40} />,
  how: <IconHelp size={40} />,
  slow: <IconSlow size={40} />,
  hear: <IconListen size={40} />,
  letter: <IconText size={40} />,
  meaning: <IconLanguage size={40} />,
  ask: <IconMic size={40} />,
};

/**
 * Tier 1 help: big picture buttons, each playing validated recorded clips.
 * Help that would reveal the answer of a reading task is explained first and
 * then marks the attempt as supported (it will not count as reading alone).
 */
export function HelpPanel({
  step,
  lex,
  lang,
  instructionReplay,
  spokenQuestions,
  lessonId,
  onSupported,
  onClose,
}: {
  step: CompiledStep;
  lex: Record<string, CompiledLex>;
  lang: Lang;
  instructionReplay: () => void;
  spokenQuestions: boolean;
  lessonId: string;
  onSupported: () => void;
  onClose: () => void;
}) {
  const { clip, line, profile } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const [warned, setWarned] = useState<Set<HelpId>>(new Set());
  const [asking, setAsking] = useState(false);
  const options = helpOptions(step, lex, { spokenQuestions: spokenQuestions && online });

  const resolve = (item: HelpItem): Speakable | null => {
    if (item.kind === "clip") return { line: clip(item.clipId), lang };
    if (item.kind === "line") {
      if (item.which === "teach" && step.kind === "teach") return { line: step.line, lang };
      if (item.which === "instruction" && step.kind === "exercise") return { line: step.instruction, lang };
      return null;
    }
    const l = lex[item.lexId];
    if (!l) return null;
    if (item.part === "gloss") return l.gloss ? { line: l.gloss.line, lang } : null;
    if (item.part === "firstSound") {
      const a = l.kind === "letter" ? l.audio : l.graphemeAudio?.[0];
      return a ? { audio: a, lang: a.lang } : null;
    }
    return { audio: l.audio, lang: l.lang, rate: item.rate };
  };

  const choose = async (id: HelpId, reveals: boolean) => {
    void track("tutor_help", { option: id, tier: 1, lessonId }, profile?.id ?? null);
    if (id === "ask") {
      setAsking(true);
      return;
    }
    const confirmed = warned.has(id);
    const seq = helpSequence(id, step, confirmed, reveals);
    if (reveals && !confirmed) setWarned(new Set(warned).add(id));
    if (reveals && confirmed) onSupported();
    if (id === "replay" && step.kind === "teach") {
      instructionReplay();
      return;
    }
    const items = seq.map(resolve).filter((x): x is Speakable => !!x);
    await speak(...items);
  };

  return (
    <Modal label={line("ui.help")?.label ?? "help"} onClose={onClose}>
      {asking ? (
        <TutorAsk lang={lang} lessonId={lessonId} step={step} lex={lex} onDone={() => setAsking(false)} />
      ) : (
        <div className="flex flex-col gap-4" data-testid="help-panel">
          <Caption line={clip("tutor.menu")} />
          <div className="grid grid-cols-2 gap-3">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                data-testid={`help-${o.id}`}
                aria-label={o.id}
                onClick={() => void choose(o.id, o.reveals)}
                className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border-4 p-3 ${
                  o.reveals && warned.has(o.id) ? "border-accent bg-accent-soft text-accent" : "border-line bg-white text-primary"
                }`}
              >
                {ICONS[o.id]}
                {o.reveals && <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-accent" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <button type="button" data-testid="help-close" onClick={onClose} className="min-h-14 rounded-2xl bg-primary text-lg font-bold text-white">
            {line("ui.close")?.label}
          </button>
        </div>
      )}
    </Modal>
  );
}

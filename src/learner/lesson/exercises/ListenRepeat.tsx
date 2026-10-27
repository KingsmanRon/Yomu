"use client";

import { useEffect, useState } from "react";
import type { CompiledExercise } from "@/lib/content/compiled";
import { useLearner } from "../../state";
import { IconCheck, IconClose, IconContinue, IconMic, IconStop } from "../../ui/icons";
import { Caption, Picture, SpeakButton } from "../../ui/kit";
import { useSpeech } from "../../ui/speech";
import { lexAudio, ReadingText, TargetAudio, useExerciseIntro } from "../parts";
import type { ExerciseProps, PracticeProps } from "../types";
import { requestMicrophone, useRecorder } from "../useRecorder";

type Ex = Extract<CompiledExercise, { type: "listen_repeat" }>;

/**
 * Listen and repeat. Pronunciation is never scored (no verified
 * pronunciation assessment exists for these learners): with a microphone the
 * learner compares their own recording with the model and says whether it
 * sounded the same; without one they say the word aloud. Either way the item
 * is recorded as "practised", never as mastered.
 */
export function ListenRepeat({ ex, lex, lang, phase, setReplay, onPractised, onDone }: ExerciseProps<Ex> & PracticeProps) {
  const { line, profile, updateActive } = useLearner();
  const { speak } = useSpeech();
  const [index, setIndex] = useState(0);
  const rec = useRecorder();
  const item = lex[ex.items[index]];
  useExerciseIntro(ex, lang, [lexAudio(lex[ex.items[0]])], setReplay, phase);

  useEffect(() => {
    if (index > 0) void speak(lexAudio(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const mic = profile?.settings.mic ?? "unknown";
  const next = (selfCheck: "same" | "different" | "no_recording") => {
    onPractised(item.id, selfCheck);
    rec.discard();
    if (index + 1 < ex.items.length) setIndex(index + 1);
    else onDone();
  };

  const setMic = async (choice: "allowed" | "declined") => {
    if (!profile) return;
    if (choice === "allowed") {
      const ok = await requestMicrophone();
      await updateActive({ settings: { ...profile.settings, mic: ok ? "allowed" : "declined" } });
      if (!ok) await speak({ line: line("mic.denied"), lang });
    } else {
      await updateActive({ settings: { ...profile.settings, mic: "declined" } });
      await speak({ line: line("mic.denied"), lang });
    }
  };

  if (mic === "unknown") {
    return (
      <div className="flex flex-col gap-4" data-testid="mic-explain">
        <div className="flex items-center justify-center rounded-3xl bg-primary-soft p-6 text-primary">
          <IconMic size={72} />
        </div>
        <Caption line={line("mic.explain")} />
        <MicExplainAudio />
        <div className="grid grid-cols-2 gap-3">
          <SpeakButton testId="mic-decline" variant="secondary" speech={line("mic.no")} onClick={() => void setMic("declined")}>
            <IconClose size={28} />
            <span>{line("mic.no")?.label}</span>
          </SpeakButton>
          <SpeakButton testId="mic-allow" speech={line("mic.allow")} onClick={() => void setMic("allowed")}>
            <IconMic size={28} />
            <span>{line("mic.allow")?.label}</span>
          </SpeakButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4" data-testid="listen-repeat">
      <span className="text-sm font-semibold text-ink-soft">
        {index + 1} / {ex.items.length}
      </span>
      {item.image && <Picture src={item.image} className="h-32 w-32" />}
      <ReadingText testId="repeat-word">{item.text}</ReadingText>
      <TargetAudio lex={item} />

      {mic === "allowed" && rec.state !== "unavailable" ? (
        // Recording stops by itself after a few seconds; the comparison shows once it is ready.
        rec.state !== "ready" ? (
          <button
            type="button"
            data-testid="record"
            aria-label={line("repeat.record")?.label ?? "record"}
            onClick={async () => {
              if (rec.state === "recording") {
                rec.stop();
                return;
              }
              await speak({ line: line("repeat.record"), lang });
              await rec.start();
            }}
            className={`flex h-24 w-24 items-center justify-center rounded-full text-white ${rec.state === "recording" ? "pulse-ring bg-danger" : "bg-primary"}`}
          >
            {rec.state === "recording" ? <IconStop size={44} /> : <IconMic size={44} />}
          </button>
        ) : (
          <CompareStep
            onCompare={async () => {
              await speak(lexAudio(item));
              await rec.playBack();
            }}
            onSame={() => next("same")}
            onDifferent={() => next("different")}
            ready={rec.state === "ready"}
          />
        )
      ) : (
        <div className="flex w-full flex-col gap-3">
          <Caption line={line("repeat.say_aloud")} />
          <SpeakButton testId="said-it" speech={line("ui.continue")} onClick={() => next("no_recording")} className="w-full">
            <IconContinue size={32} />
          </SpeakButton>
        </div>
      )}
    </div>
  );
}

function MicExplainAudio() {
  const { line, lang } = useLearner();
  const { speak } = useSpeech();
  useEffect(() => {
    if (lang) void speak({ line: line("mic.explain"), lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function CompareStep({ onCompare, onSame, onDifferent, ready }: { onCompare: () => Promise<void>; onSame: () => void; onDifferent: () => void; ready: boolean }) {
  const { line, lang } = useLearner();
  const { speak } = useSpeech();
  useEffect(() => {
    if (!ready || !lang) return;
    void (async () => {
      await speak({ line: line("repeat.compare"), lang });
      await onCompare();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return (
    <div className="flex w-full flex-col gap-3" data-testid="self-check">
      <Caption line={line("repeat.compare")} />
      <SpeakButton testId="compare-again" variant="secondary" speech={line("ui.listen_again")} onClick={() => void onCompare()}>
        <IconMic size={24} />
        <span>{line("ui.listen_again")?.label}</span>
      </SpeakButton>
      <div className="grid grid-cols-2 gap-3">
        <SpeakButton testId="self-different" variant="secondary" speech={line("repeat.different")} onClick={onDifferent}>
          <span className="text-2xl">≠</span>
          <span>{line("repeat.different")?.label}</span>
        </SpeakButton>
        <SpeakButton testId="self-same" speech={line("repeat.same")} onClick={onSame}>
          <IconCheck size={28} />
          <span>{line("repeat.same")?.label}</span>
        </SpeakButton>
      </div>
    </div>
  );
}

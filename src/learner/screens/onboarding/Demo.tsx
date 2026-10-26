"use client";

import { useState } from "react";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconCheck, IconContinue, IconHelp } from "../../ui/icons";
import { Caption, ListenButton, Picture, Screen, SpeakButton } from "../../ui/kit";
import { useSpeakOnMount, useSpeech } from "../../ui/speech";

/**
 * How the app works, learned by doing: tap the listen button, tap a picture,
 * tap the green arrow, and find help. Each step is spoken and the control
 * being taught pulses.
 */
export function Demo() {
  const { lang, line, clip } = useLearner();
  const { speak } = useSpeech();
  const [step, setStep] = useState(0);
  const say = (id: string) => lang && void speak({ line: line(id), lang });
  const steps = ["demo.listen", "demo.choose", "demo.continue", "demo.help"];
  const current = line(steps[step]);
  useSpeakOnMount(lang && current ? [{ line: current, lang }] : null, [step, current?.id]);

  return (
    <Screen label="how it works" className="gap-6 py-6">
      <div className="flex justify-center gap-2" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s} className={`h-3 w-10 rounded-full ${i <= step ? "bg-primary" : "bg-line"}`} />
        ))}
      </div>
      <Caption line={current} className="text-center" />

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {step === 0 && (
          <div className="pulse-ring rounded-full">
            <ListenButton
              size="lg"
              testId="demo-listen"
              onListen={async () => {
                if (lang) await speak({ line: line("demo.listen_done"), lang });
                setStep(1);
              }}
            />
          </div>
        )}
        {step === 1 && (
          <div className="grid w-full grid-cols-2 gap-4">
            <button type="button" aria-label="small picture" className="flex items-center justify-center rounded-3xl border-4 border-line bg-white p-4 opacity-60">
              <Picture src="/images/sun.svg" className="h-20 w-20" />
            </button>
            <button
              type="button"
              data-testid="demo-picture"
              aria-label="big picture"
              onClick={async () => {
                if (lang) await speak({ line: clip("fb.correct.1"), lang });
                setStep(2);
              }}
              className="pulse-ring flex items-center justify-center rounded-3xl border-4 border-primary bg-white p-2"
            >
              <Picture src="/images/house.svg" className="h-36 w-36" />
            </button>
          </div>
        )}
        {step === 2 && (
          <SpeakButton testId="demo-continue" speech={line("ui.continue")} onClick={() => setStep(3)} className="pulse-ring w-full">
            <IconContinue size={36} />
          </SpeakButton>
        )}
        {step === 3 && (
          <div className="flex flex-col items-center gap-6">
            <button
              type="button"
              data-testid="demo-help"
              aria-label={line("ui.help")?.label ?? "help"}
              onClick={() => say("ui.help")}
              className="pulse-ring flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft text-accent"
            >
              <IconHelp size={48} />
            </button>
            <div className="flex items-center gap-2 text-good">
              <IconCheck size={32} />
            </div>
          </div>
        )}
      </div>

      {step === 3 && (
        <SpeakButton
          testId="continue"
          speech={line("ui.continue")}
          onClick={async () => {
            if (lang) await speak({ line: line("demo.done"), lang });
            navigate("/profile/new");
          }}
          className="w-full"
        >
          <IconContinue size={36} />
        </SpeakButton>
      )}
      {step < 3 && (
        <div className="flex justify-center">
          <ListenButton size="sm" onListen={() => say(steps[step])} testId="demo-step-listen" />
        </div>
      )}
    </Screen>
  );
}

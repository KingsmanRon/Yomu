"use client";

import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconContinue } from "../../ui/icons";
import { Caption, ListenButton, Picture, Screen, SpeakButton } from "../../ui/kit";
import { useSpeakOnMount, useSpeech } from "../../ui/speech";

/** Spoken welcome in the chosen language. */
export function Hello() {
  const { lang, line } = useLearner();
  const hello = line("welcome.hello");
  const { speak } = useSpeech();
  useSpeakOnMount(lang && hello ? [{ line: hello, lang }] : null, [hello?.id]);

  return (
    <Screen label="welcome" className="justify-between gap-6 py-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-end justify-center gap-2">
          <Picture src="/images/woman.svg" className="h-40 w-40" />
          <Picture src="/images/work.svg" className="h-44 w-44" />
        </div>
        <ListenButton size="lg" onListen={() => lang && hello && void speak({ line: hello, lang })} />
        <Caption line={hello} className="items-center" />
      </div>
      <SpeakButton testId="continue" speech={line("ui.continue")} onClick={() => navigate("/demo")} className="w-full">
        <IconContinue size={36} />
      </SpeakButton>
    </Screen>
  );
}

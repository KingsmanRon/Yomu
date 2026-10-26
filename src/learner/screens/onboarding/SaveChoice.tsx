"use client";

import { backendConfigured } from "@/config/app";
import { track } from "../../analytics";
import { useOnline } from "../../offline/network";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconCloud, IconPhone, IconShield } from "../../ui/icons";
import { Caption, ListenButton, Screen, SpeakButton } from "../../ui/kit";
import { useSpeakOnMount, useSpeech } from "../../ui/speech";

/**
 * Save progress online (spoken consent, then registration) or keep it on
 * this phone only (guest). Nothing is stored on a server unless the learner
 * chooses the first option and agrees to the consent.
 */
export function SaveChoice() {
  const { lang, line, profile } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const prompt = line("save.choice");
  useSpeakOnMount(lang && prompt ? [{ line: prompt, lang }] : null, [prompt?.id]);
  if (!lang || !profile) return null;
  const canSaveOnline = backendConfigured();

  return (
    <Screen label="save your learning" className="gap-6 py-6">
      <div className="flex items-start gap-3">
        <ListenButton onListen={() => void speak({ line: prompt, lang })} />
        <Caption line={prompt} />
      </div>
      <div className="mt-auto flex flex-col gap-4">
        {canSaveOnline && (
          <SpeakButton
            testId="save-online"
            speech={line("save.online")}
            onClick={async () => {
              if (!online) {
                await speak({ line: line("consent.offline"), lang });
                navigate("/start-level");
                return;
              }
              navigate("/consent");
            }}
            className="min-h-24 w-full justify-start"
          >
            <IconCloud size={40} />
            <IconShield size={32} />
            <span className="text-left">{line("save.online")?.label}</span>
          </SpeakButton>
        )}
        <SpeakButton
          testId="save-phone-only"
          variant="secondary"
          speech={line("save.phone_only")}
          onClick={() => {
            void track("onboarding_step", { step: "guest" }, profile.id);
            navigate("/start-level");
          }}
          className="min-h-24 w-full justify-start"
        >
          <IconPhone size={40} />
          <span className="text-left">{line("save.phone_only")?.label}</span>
        </SpeakButton>
      </div>
    </Screen>
  );
}

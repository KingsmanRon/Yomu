"use client";

import { useEffect, useState } from "react";
import { ASSESSMENT_INSTRUMENT_VERSION } from "@/config/app";
import { track } from "../../analytics";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconCheck, IconContinue, IconPlay } from "../../ui/icons";
import { Caption, ListenButton, Screen, SpeakButton } from "../../ui/kit";
import { useSpeakOnMount, useSpeech } from "../../ui/speech";

/**
 * Offer the short placement activity, or let the learner skip it and say
 * whether they can read their own language yet (which decides between the
 * Level 0 bridge and Level 1). Either way they can change level later.
 */
export function StartLevel() {
  const { lang, line, profile, record, updateActive } = useLearner();
  const { speak } = useSpeech();
  const [asked, setAsked] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Opened again after placement was recorded (for example a reload while the
  // result was being spoken): go home instead of placing twice.
  const [placedAtOpen, setPlacedAtOpen] = useState<boolean | null>(null);
  if (profile && placedAtOpen === null) setPlacedAtOpen(profile.onboarding.placementDone);
  useEffect(() => {
    if (placedAtOpen) navigate("/home", { replace: true });
  }, [placedAtOpen]);
  const offer = line("assess.offer");
  useSpeakOnMount(lang && offer ? [{ line: offer, lang }] : null, [offer?.id]);
  if (!lang || !profile) return null;

  const place = async (level: number) => {
    if (placing) return;
    setPlacing(true);
    await record("assessment", {
      kind: "placement",
      instrument: ASSESSMENT_INSTRUMENT_VERSION,
      skipped: true,
      scores: {},
      placedLevel: level,
    });
    await updateActive({ onboarding: { completed: true, placementDone: true } });
    void track("onboarding_complete", { skipped: true, level }, profile.id);
    await speak({ line: line(`place.level${level}`), lang }, { line: line("place.change_any_time"), lang });
    navigate("/home");
  };

  if (asked) {
    const q = line("place.self_question");
    return (
      <Screen label="can you read your language" className="gap-6 py-6">
        <div className="flex items-start gap-3">
          <ListenButton onListen={() => void speak({ line: q, lang })} />
          <Caption line={q} />
        </div>
        <div className="mt-auto flex flex-col gap-4">
          <SpeakButton testId="self-can-read" speech={line("place.self_yes")} disabled={placing} onClick={() => void place(1)} className="min-h-24 w-full">
            <IconCheck size={36} />
            <span>{line("place.self_yes")?.label}</span>
          </SpeakButton>
          <SpeakButton testId="self-not-yet" variant="secondary" speech={line("place.self_no")} disabled={placing} onClick={() => void place(0)} className="min-h-24 w-full">
            <span>{line("place.self_no")?.label}</span>
          </SpeakButton>
        </div>
      </Screen>
    );
  }

  return (
    <Screen label="find where to start" className="gap-6 py-6">
      <div className="flex items-start gap-3">
        <ListenButton onListen={() => void speak({ line: offer, lang })} />
        <Caption line={offer} />
      </div>
      <div className="mt-auto flex flex-col gap-4">
        <SpeakButton testId="assessment-start" speech={line("assess.start")} onClick={() => navigate("/assessment")} className="min-h-24 w-full">
          <IconPlay size={36} />
          <span>{line("assess.start")?.label}</span>
        </SpeakButton>
        <SpeakButton
          testId="assessment-skip"
          variant="secondary"
          speech={line("assess.skip")}
          onClick={() => {
            setAsked(true);
            void speak({ line: line("place.self_question"), lang });
          }}
          className="w-full"
        >
          <IconContinue size={28} />
          <span>{line("assess.skip")?.label}</span>
        </SpeakButton>
      </div>
    </Screen>
  );
}

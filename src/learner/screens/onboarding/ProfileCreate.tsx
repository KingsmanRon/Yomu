"use client";

import { useEffect, useState } from "react";
import { claimOnboardingEvents, track } from "../../analytics";
import { AVATARS, createProfile } from "../../offline/profiles";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconCheck, IconContinue } from "../../ui/icons";
import { Caption, ListenButton, Picture, Screen, SpeakButton } from "../../ui/kit";
import { PinPad } from "../../ui/PinPad";
import { useSpeakOnMount, useSpeech } from "../../ui/speech";

/**
 * Picture profile and picture PIN. Stored only on this phone until the
 * learner chooses to save online (after the spoken consent).
 */
export function ProfileCreate() {
  const { db, lang, line, activate } = useLearner();
  const { speak } = useSpeech();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [phase, setPhase] = useState<"avatar" | "pin" | "confirm">("avatar");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const prompt = line(phase === "avatar" ? "profile.choose_picture" : phase === "pin" ? "pin.create" : "pin.confirm");
  useSpeakOnMount(lang && prompt ? [{ line: prompt, lang }] : null, [phase, prompt?.id]);

  useEffect(() => {
    if (!lang) navigate("/language", { replace: true });
  }, [lang]);
  if (!lang) return null;

  const onPin = async (next: string) => {
    setPin(next);
    if (next.length < 4) return;
    if (phase === "pin") {
      setFirst(next);
      setPin("");
      setPhase("confirm");
      return;
    }
    if (next !== first) {
      await speak({ line: line("pin.mismatch"), lang });
      setFirst("");
      setPin("");
      setPhase("pin");
      return;
    }
    if (!db || !avatar) return;
    setBusy(true);
    const profile = await createProfile(db, { avatarId: avatar, language: lang, pin: next });
    await activate(profile);
    await claimOnboardingEvents(db, profile.id);
    void track("onboarding_step", { step: "profile_created", language: lang }, profile.id);
    await speak({ line: line("pin.saved"), lang });
    navigate("/save");
  };

  return (
    <Screen label="your picture and secret code" className="gap-5 py-6">
      <div className="flex items-start gap-3">
        <ListenButton onListen={() => prompt && void speak({ line: prompt, lang })} />
        <Caption line={prompt} />
      </div>

      {phase === "avatar" ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                data-testid={`avatar-${a}`}
                aria-label={a.replace("avatar-", "")}
                aria-pressed={avatar === a}
                onClick={() => setAvatar(a)}
                className={`relative aspect-square rounded-full border-4 bg-white p-1 ${avatar === a ? "border-primary" : "border-transparent"}`}
              >
                <Picture src={`/images/${a}.svg`} className="h-full w-full" />
                {avatar === a && (
                  <span className="absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
                    <IconCheck size={22} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <SpeakButton testId="continue" speech={line("ui.continue")} disabled={!avatar} onClick={() => setPhase("pin")} className="mt-auto w-full">
            <IconContinue size={36} />
          </SpeakButton>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4">
          {avatar && <Picture src={`/images/${avatar}.svg`} className="h-20 w-20" />}
          <PinPad value={pin} onChange={onPin} disabled={busy} />
        </div>
      )}
    </Screen>
  );
}

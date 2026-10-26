"use client";

import { useEffect, useState } from "react";
import { track } from "../../analytics";
import { ApiError } from "../../offline/api";
import { verifyLocalPin } from "../../offline/profiles";
import { registerProfile } from "../../register";
import { navigate } from "../../router";
import { useLearner } from "../../state";
import { IconBin, IconCheck, IconClose, IconCloud, IconEar, IconLock, IconPhone, IconRetry, IconShield } from "../../ui/icons";
import { Caption, ListenButton, Picture, Screen, SpeakButton, Spinner } from "../../ui/kit";
import { PinPad } from "../../ui/PinPad";
import { useSpeech } from "../../ui/speech";

const PARTS = [
  { id: "consent.intro", icon: <IconEar size={56} /> },
  { id: "consent.what", icon: <IconLock size={56} /> },
  { id: "consent.why", icon: <IconCloud size={56} /> },
  { id: "consent.who", icon: <IconShield size={56} /> },
  { id: "consent.delete", icon: <IconBin size={56} /> },
] as const;

/**
 * Spoken consent (POPIA) before anything is stored on the server: what is
 * stored, why, who can see it and how to delete it. Then an optional,
 * separate question about anonymous usage counts, then the learner confirms
 * their PIN and the account is created. Consent version and time are
 * recorded by the server.
 */
export function Consent({ then }: { then?: string }) {
  const { db, lang, line, profile, refreshProfiles, activate } = useLearner();
  const { speak } = useSpeech();
  const [heard, setHeard] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [phase, setPhase] = useState<"explain" | "analytics" | "pin" | "saving" | "error">("explain");
  const [analytics, setAnalytics] = useState(false);
  const [pin, setPin] = useState("");

  const playAll = async () => {
    if (!lang) return;
    for (const p of [...PARTS, { id: "consent.question" }]) {
      setActive(p.id);
      const r = await speak({ line: line(p.id), lang });
      if (r === "stopped" || r === "blocked") break;
    }
    setActive(null);
    setHeard(true);
  };

  useEffect(() => {
    const t = setTimeout(() => void playAll(), 300);
    // Never force anyone to wait: answering becomes possible after 25 s even if audio failed.
    const t2 = setTimeout(() => setHeard(true), 25_000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  if (!lang || !profile || !db) return null;
  const next = then === "join" ? "/join" : profile.onboarding.placementDone ? "/home" : "/start-level";

  const decline = async () => {
    await speak({ line: line("consent.declined"), lang });
    navigate(then === "join" ? "/me" : next);
  };

  const finish = async (enteredPin: string) => {
    setPhase("saving");
    try {
      if (!(await verifyLocalPin(profile, enteredPin))) {
        await speak({ line: line("pin.wrong"), lang });
        setPin("");
        setPhase("pin");
        return;
      }
      const updated = await registerProfile(db, profile, { pin: enteredPin, analytics });
      await refreshProfiles();
      await activate(updated);
      void track("registration", { language: lang }, profile.id);
      await speak({ line: line("consent.saved"), lang });
      navigate(next);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "network";
      void track("onboarding_step", { step: "registration_failed", code }, profile.id);
      setPhase("error");
      await speak({ line: line(code === "network" ? "consent.offline" : "sys.error_generic") ?? null, lang });
    }
  };

  if (phase === "saving") return <Spinner />;

  if (phase === "error")
    return (
      <Screen label="could not save" className="items-center justify-center gap-8">
        <Caption line={line("consent.offline")} className="text-center" />
        <SpeakButton testId="retry" speech={line("ui.continue")} onClick={() => setPhase("pin")} className="w-full">
          <IconRetry size={36} />
        </SpeakButton>
        <SpeakButton testId="consent-later" variant="secondary" speech={line("save.phone_only")} onClick={() => navigate(next)} className="w-full">
          <IconPhone size={32} />
        </SpeakButton>
      </Screen>
    );

  if (phase === "pin")
    return (
      <Screen label="confirm your secret code" className="gap-4 py-6">
        <div className="flex items-start gap-3">
          <ListenButton onListen={() => void speak({ line: line("consent.pin"), lang })} />
          <Caption line={line("consent.pin")} />
        </div>
        <Picture src={`/images/${profile.avatarId}.svg`} className="mx-auto h-16 w-16" />
        <PinPad
          value={pin}
          onChange={(v) => {
            setPin(v);
            if (v.length === 4) void finish(v);
          }}
        />
      </Screen>
    );

  if (phase === "analytics")
    return (
      <Screen label="usage counts" className="gap-6 py-6">
        <div className="flex items-start gap-3">
          <ListenButton onListen={() => void speak({ line: line("consent.analytics"), lang })} />
          <Caption line={line("consent.analytics")} />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-4">
          <SpeakButton testId="analytics-no" variant="secondary" speech={line("share.no")} onClick={() => { setAnalytics(false); setPhase("pin"); void speak({ line: line("consent.pin"), lang }); }} className="min-h-24">
            <IconClose size={40} />
          </SpeakButton>
          <SpeakButton testId="analytics-yes" speech={line("share.yes")} onClick={() => { setAnalytics(true); setPhase("pin"); void speak({ line: line("consent.pin"), lang }); }} className="min-h-24">
            <IconCheck size={40} />
          </SpeakButton>
        </div>
      </Screen>
    );

  return (
    <Screen label="consent" className="gap-4 py-4">
      <div className="flex justify-end">
        <ListenButton onListen={() => void playAll()} />
      </div>
      <ol className="flex flex-col gap-3">
        {PARTS.map((p) => (
          <li
            key={p.id}
            className={`flex items-start gap-3 rounded-2xl border-2 bg-white p-3 transition ${active === p.id ? "border-primary" : "border-line"}`}
          >
            <span className={`shrink-0 rounded-xl p-2 ${active === p.id ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{p.icon}</span>
            <Caption line={line(p.id)} />
          </li>
        ))}
      </ol>
      <Caption line={line("consent.question")} className="font-bold" />
      <div className="sticky bottom-0 grid grid-cols-1 gap-3 bg-paper py-3">
        <SpeakButton testId="consent-agree" speech={line("consent.agree")} disabled={!heard} onClick={() => { setPhase("analytics"); void speak({ line: line("consent.analytics"), lang }); }} className="min-h-20 w-full">
          <IconCheck size={36} />
          <span>{line("consent.agree")?.label}</span>
        </SpeakButton>
        <SpeakButton testId="consent-decline" variant="secondary" speech={line("consent.decline")} onClick={() => void decline()} className="w-full">
          <IconPhone size={28} />
          <span>{line("consent.decline")?.label}</span>
        </SpeakButton>
      </div>
    </Screen>
  );
}

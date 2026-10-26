"use client";

import { useEffect, useState } from "react";
import type { CompiledLine } from "@/lib/content/compiled";
import { loadAppLines } from "../content";
import { localPinWaitSeconds, updateProfile, verifyLocalPin } from "../offline/profiles";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconBack, IconTeacher } from "../ui/icons";
import { Caption, ListenButton, Picture, Screen, Spinner } from "../ui/kit";
import { PinPad } from "../ui/PinPad";
import { useSpeech } from "../ui/speech";

/**
 * Unlock a learner's profile on a shared phone with their picture PIN.
 * After several wrong tries there is a short, growing pause (never a
 * lockout), and the facilitator can help reset a forgotten PIN.
 */
export function PinEntry({ profileId }: { profileId: string }) {
  const { db, profiles, activate, refreshProfiles } = useLearner();
  const { speak } = useSpeech();
  const profile = profiles.find((p) => p.id === profileId);
  const [pin, setPin] = useState("");
  const [lines, setLines] = useState<Record<string, CompiledLine> | null>(null);
  const [waitUntil, setWaitUntil] = useState<number>(profile?.pinRetryAfter ? Date.parse(profile.pinRetryAfter) : 0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!profile) return;
    loadAppLines(profile.language).then((l) => {
      setLines(l.lines);
      void speak({ line: l.lines["pin.enter"], lang: profile.language });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waitUntil]);

  if (!profile || !db) return <Spinner />;
  const lang = profile.language;
  const waiting = waitUntil > now;

  const submit = async (value: string) => {
    if (await verifyLocalPin(profile, value)) {
      await updateProfile(db, profile.id, { pinFailures: 0, pinRetryAfter: undefined });
      await activate({ ...profile, pinFailures: 0, pinRetryAfter: undefined });
      navigate(profile.onboarding.placementDone ? "/home" : "/", { replace: true });
      return;
    }
    const failures = profile.pinFailures + 1;
    const wait = localPinWaitSeconds(failures);
    const retryAfter = wait ? new Date(Date.now() + wait * 1000).toISOString() : undefined;
    await updateProfile(db, profile.id, { pinFailures: failures, pinRetryAfter: retryAfter });
    await refreshProfiles();
    setPin("");
    if (retryAfter) {
      setWaitUntil(Date.parse(retryAfter));
      await speak({ line: lines?.["pin.wait"], lang });
    } else await speak({ line: lines?.["pin.wrong"], lang });
  };

  return (
    <Screen label="secret code" className="gap-4 py-4">
      <div className="flex items-center justify-between">
        <button type="button" data-testid="back" aria-label="back" onClick={() => navigate("/profiles")} className="flex h-12 w-12 items-center justify-center rounded-full text-ink-soft">
          <IconBack />
        </button>
        <ListenButton size="sm" onListen={() => void speak({ line: lines?.["pin.enter"], lang })} />
      </div>
      <Picture src={`/images/${profile.avatarId}.svg`} className="mx-auto h-24 w-24" />
      <Caption line={lines?.[waiting ? "pin.wait" : "pin.enter"]} always className="items-center text-center" />
      {waiting ? (
        <p className="text-center text-5xl font-extrabold text-accent" data-testid="pin-wait" role="timer">
          {Math.ceil((waitUntil - now) / 1000)}
        </p>
      ) : (
        <PinPad
          value={pin}
          onChange={(v) => {
            setPin(v);
            if (v.length === 4) void submit(v);
          }}
        />
      )}
      <button type="button" data-testid="pin-assist" aria-label="teacher help" onClick={() => navigate(`/assist/${profile.id}`)} className="mt-auto flex items-center justify-center gap-2 p-3 text-ink-soft">
        <IconTeacher size={28} />
      </button>
    </Screen>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CONSENT_VERSION } from "@/config/app";
import { api, ApiError } from "../offline/api";
import { accessToken, forgetSession } from "../offline/auth";
import { useOnline } from "../offline/network";
import { deleteProfile, updateProfile } from "../offline/profiles";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconBin, IconCheck, IconClose, IconCloud, IconExport, IconGroup, IconPhone } from "../ui/icons";
import { Caption, HoldButton, ListenButton, Screen, SpeakButton, Spinner, TopBar } from "../ui/kit";
import { useSpeech } from "../ui/speech";

interface ClassInfo {
  cohortId: string;
  name: string;
  share: { progress: boolean; mastery: boolean; mistakes: boolean; tutorLogs: boolean };
}

/**
 * Privacy controls, all spoken: what each class can see (change or stop
 * sharing, effective immediately), a copy of my data, withdrawing consent to
 * online storage (keeping learning on the phone), and deleting everything.
 */
export function Privacy() {
  const { db, lang, line, profile, lock, refreshProfiles, activate } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Bumped to reload the class list after a sharing change.
  const [reload, setReload] = useState(0);
  const loadClasses = () => setReload((n) => n + 1);
  const profileId = profile?.id;
  const learnerId = profile?.learnerId;
  useEffect(() => {
    if (!profileId || !learnerId || !online) return;
    let cancelled = false;
    api<{ classes: ClassInfo[] }>(profileId, "/api/learner/cohorts")
      .then((r) => !cancelled && setClasses(r.classes))
      .catch(() => !cancelled && setClasses([]));
    return () => {
      cancelled = true;
    };
  }, [profileId, learnerId, online, reload]);

  if (!lang || !profile || !db) return <Spinner />;
  const moved = !!profile.sessionLost;
  const registered = !!profile.learnerId && !moved;

  const needOnline = async () => {
    await speak({ line: line("delete.offline"), lang });
  };

  const setSharing = async (c: ClassInfo, share: ClassInfo["share"]) => {
    if (!online) return needOnline();
    setBusy(true);
    try {
      await api(profile.id, "/api/learner/cohort/sharing", {
        body: { cohortId: c.cohortId, share, consentVersion: CONSENT_VERSION, language: lang },
      });
      if (!share.progress) await speak({ line: line("share.stopped"), lang });
      loadClasses();
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    if (!online) return needOnline();
    const token = await accessToken(profile.id);
    const res = await fetch("/api/learner/export", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return speak({ line: line("sys.error_generic"), lang });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-learning-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    await speak({ line: line("export.done"), lang });
  };

  const deleteOnline = async (): Promise<boolean> => {
    if (!registered) return true;
    if (!online) {
      await needOnline();
      return false;
    }
    try {
      await api(profile.id, "/api/learner/delete", { body: {} });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "not_registered")) {
        await speak({ line: line("sys.error_generic"), lang });
        return false;
      }
    }
    await forgetSession(profile.id);
    return true;
  };

  const withdrawConsent = async () => {
    setBusy(true);
    try {
      if (!(await deleteOnline())) return;
      const updated = await updateProfile(db, profile.id, { learnerId: undefined, registeredAt: undefined, analyticsConsent: false, syncCursor: 0 });
      await refreshProfiles();
      await activate(updated);
      await speak({ line: line("delete.done"), lang });
      navigate("/me");
    } finally {
      setBusy(false);
    }
  };

  /** After a move, the account lives on the other phone: remove only this phone's copy. */
  const removeFromPhone = async () => {
    setBusy(true);
    try {
      await forgetSession(profile.id);
      lock();
      await deleteProfile(db, profile.id);
      await refreshProfiles();
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const deleteEverything = async () => {
    setBusy(true);
    try {
      if (!(await deleteOnline())) return;
      await speak({ line: line("delete.done"), lang });
      lock();
      await deleteProfile(db, profile.id);
      await refreshProfiles();
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <Spinner />;

  return (
    <Screen label="privacy">
      <TopBar onBack={() => navigate("/me")} onListen={() => void speak({ line: line("me.sharing"), lang })} />

      {registered && (
        <section className="flex flex-col gap-3" aria-label="classes">
          {classes === null && online && <Spinner />}
          {classes?.map((c) => (
            <div key={c.cohortId} className="flex flex-col gap-3 rounded-3xl bg-white p-4" data-testid={`class-${c.cohortId}`}>
              <div className="flex items-center gap-3">
                <IconGroup size={32} className="text-primary" />
                <span className="flex-1 text-lg font-bold">{c.name}</span>
              </div>
              {(
                [
                  ["mastery", "share.mastery"],
                  ["mistakes", "share.mistakes"],
                  ["tutorLogs", "share.tutor"],
                ] as const
              ).map(([key, lineId]) => (
                <div key={key} className="flex items-center gap-3">
                  <ListenButton size="sm" onListen={() => void speak({ line: line(lineId), lang })} />
                  <span className="flex-1 text-base">{line(lineId)?.text}</span>
                  <button
                    type="button"
                    data-testid={`share-${key}`}
                    aria-pressed={c.share[key]}
                    aria-label={key}
                    onClick={() => void setSharing(c, { ...c.share, [key]: !c.share[key] })}
                    className={`flex h-12 w-20 shrink-0 items-center rounded-full p-1 ${c.share[key] ? "justify-end bg-good" : "justify-start bg-line"}`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                      {c.share[key] ? <IconCheck size={22} className="text-good" /> : <IconClose size={22} className="text-ink-soft" />}
                    </span>
                  </button>
                </div>
              ))}
              <SpeakButton
                testId="stop-sharing"
                variant="secondary"
                speech={line("share.stop_explain")}
                onClick={async () => {
                  await speak({ line: line("share.stop_explain"), lang });
                  await setSharing(c, { progress: false, mastery: false, mistakes: false, tutorLogs: false });
                }}
              >
                <IconClose size={24} />
                <span>{line("share.stop_explain")?.label}</span>
              </SpeakButton>
            </div>
          ))}
        </section>
      )}

      <section className="mt-4 flex flex-col gap-3" aria-label="my data">
        {registered && (
          <SpeakButton testId="export-data" variant="secondary" speech={line("me.export")} onClick={() => void exportData()} className="w-full justify-start">
            <IconExport size={28} />
            <span>{line("me.export")?.label}</span>
          </SpeakButton>
        )}
        {registered && (
          <div className="flex flex-col gap-2 rounded-3xl bg-white p-4">
            <Caption line={line("consent.withdraw")} />
            <SpeakButton testId="withdraw-consent" variant="secondary" speech={line("consent.withdraw")} onClick={() => void withdrawConsent()}>
              <IconCloud size={24} />
              <span>→</span>
              <IconPhone size={24} />
              <span>{line("consent.withdraw")?.label}</span>
            </SpeakButton>
          </div>
        )}
        {moved && (
          <div className="flex flex-col gap-3 rounded-3xl border-2 border-accent bg-accent-soft p-4" data-testid="moved-phone">
            <div className="flex items-start gap-3">
              <ListenButton size="sm" onListen={() => void speak({ line: line("me.moved_phone"), lang })} />
              <Caption line={line("me.moved_phone")} />
            </div>
            <HoldButton testId="remove-from-phone" speech={line("me.moved_phone")} onConfirm={() => void removeFromPhone()}>
              <IconBin size={28} />
              <span>{line("me.moved_phone")?.label}</span>
            </HoldButton>
          </div>
        )}
        <div className={`flex flex-col gap-3 rounded-3xl border-2 border-danger bg-danger-soft p-4 ${moved ? "hidden" : ""}`}>
          <div className="flex items-start gap-3">
            <ListenButton size="sm" onListen={() => void speak({ line: line("delete.explain"), lang })} />
            <Caption line={line("delete.explain")} />
          </div>
          <HoldButton testId="delete-everything" speech={line("delete.confirm")} onConfirm={() => void deleteEverything()}>
            <IconBin size={28} />
            <span>{line("delete.confirm")?.label}</span>
          </HoldButton>
        </div>
      </section>
    </Screen>
  );
}

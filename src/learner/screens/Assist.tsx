"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { backendConfigured, type TeachingLanguage } from "@/config/app";
import type { CompiledLine } from "@/lib/content/compiled";
import { loadAppLines } from "../content";
import { api, ApiError } from "../offline/api";
import { facilitatorSignIn, forgetSession, signInAnonymously } from "../offline/auth";
import type { StoredProfile } from "../offline/db";
import { useOnline } from "../offline/network";
import { hashLocalPin, restoreProfile, updateProfile } from "../offline/profiles";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconBack, IconCheck, IconOffline, IconTeacher } from "../ui/icons";
import { Caption, ListenButton, Picture, Screen, Spinner } from "../ui/kit";
import { PinPad } from "../ui/PinPad";
import { useSpeech } from "../ui/speech";

interface AssistLearner {
  learnerId: string;
  avatarId: string;
  nickname: string | null;
  language: TeachingLanguage;
}
interface AssistCohort {
  id: string;
  name: string;
  learners: AssistLearner[];
}
interface Facilitator {
  token: string;
  signOut: () => Promise<void>;
  cohorts: AssistCohort[];
}
type Target = { kind: "reset"; profile: StoredProfile } | { kind: "transfer"; learner: AssistLearner; cohort: string };
type Phase = "signin" | "choose" | "handover" | "enter" | "create" | "confirm" | "saving" | "done";

/**
 * Facilitator-assisted mode. A facilitator signs in on the learner's phone
 * (in memory only) to reset a forgotten picture PIN, or to bring a learner's
 * saved progress to a new phone. The facilitator's part is in plain English
 * text; the phone is then handed to the learner, who hears what to do in
 * their own language and chooses or enters the PIN themselves. The PIN is
 * never shown, and every action is recorded on the learner's account.
 */
export function Assist({ profileId }: { profileId?: string }) {
  const { db, profiles, activate, refreshProfiles } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>("signin");
  const [facilitator, setFacilitator] = useState<Facilitator | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState("");
  const [lines, setLines] = useState<Record<string, CompiledLine> | null>(null);
  // The anonymous session made for a transfer is reused if the learner retries.
  const transferDevice = useRef<{ id: string; token: string } | null>(null);
  const fromPinScreen = profiles.find((p) => p.id === profileId) ?? null;

  const learnerLang: TeachingLanguage | null =
    target?.kind === "reset"
      ? target.profile.language
      : target?.kind === "transfer"
        ? target.learner.language
        : (fromPinScreen?.language ?? [...profiles].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]?.language ?? null);

  useEffect(() => {
    if (!learnerLang) return;
    let cancelled = false;
    loadAppLines(learnerLang).then((l) => !cancelled && setLines(l.lines));
    return () => {
      cancelled = true;
    };
  }, [learnerLang]);

  // Tell the learner, in their language, what is happening.
  useEffect(() => {
    if (lines && learnerLang && phase === "signin") void speak({ line: lines["assist.handover"], lang: learnerLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, learnerLang]);

  const say = (id: string) => (lines && learnerLang ? speak({ line: lines[id], lang: learnerLang }) : Promise.resolve());

  // End the facilitator's session when leaving this screen.
  const signOutRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => () => void signOutRef.current?.(), []);

  const leave = async (to: string) => {
    await facilitator?.signOut();
    signOutRef.current = null;
    if (transferDevice.current && phase !== "done") await forgetSession(transferDevice.current.id);
    navigate(to, { replace: true });
  };

  if (!db) return <Spinner />;

  const choose = (t: Target) => {
    setTarget(t);
    setMessage(null);
    setPhase("handover");
  };

  const finishReset = async (profile: StoredProfile, newPin: string) => {
    const local = await hashLocalPin(newPin);
    const updated = await updateProfile(db, profile.id, { pin: local, pinFailures: 0, pinRetryAfter: undefined });
    await activate(updated);
  };

  const submit = async (opts: { pin?: string; newPin?: string }) => {
    if (!target || !facilitator) return;
    setPhase("saving");
    try {
      if (target.kind === "reset") {
        if (target.profile.learnerId) {
          await api(null, "/api/assist/pin-reset", {
            token: facilitator.token,
            body: { learnerId: target.profile.learnerId, newPin: opts.newPin },
          });
        }
        await finishReset(target.profile, opts.newPin!);
        setPhase("done");
        await say("pin.saved");
      } else {
        if (!transferDevice.current) {
          const id = crypto.randomUUID();
          transferDevice.current = { id, token: await signInAnonymously(id) };
        }
        const device = transferDevice.current;
        const r = await api<{ learnerId: string; language: TeachingLanguage; avatarId: string; nickname: string | null; analyticsConsent: boolean }>(
          null,
          "/api/assist/transfer",
          {
            token: facilitator.token,
            body: { learnerId: target.learner.learnerId, deviceProfileId: device.id, deviceToken: device.token, ...opts },
          },
        );
        const profile = await restoreProfile(db, {
          id: device.id,
          learnerId: r.learnerId,
          avatarId: r.avatarId,
          language: r.language,
          nickname: r.nickname ?? undefined,
          pin: (opts.pin ?? opts.newPin)!,
          analyticsConsent: r.analyticsConsent,
        });
        await refreshProfiles();
        await activate(profile);
        setPhase("done");
        await say("assist.moved");
      }
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "network";
      setPin("");
      setFirst("");
      if (code === "pin_wrong") {
        setPhase("enter");
        await say("pin.wrong");
      } else if (code === "pin_wait") {
        setPhase("enter");
        await say("pin.wait");
      } else {
        setMessage(
          code === "not_your_learner"
            ? "This learner is not in one of your classes."
            : code === "network"
              ? "The internet connection was lost. Nothing was changed. Try again when connected."
              : "Something went wrong. Nothing was changed. Please try again.",
        );
        setPhase("choose");
        await say("sys.error_generic");
      }
    }
  };

  /* ---------------- learner's part ---------------- */
  if (phase === "enter" || phase === "create" || phase === "confirm") {
    const avatar = target?.kind === "reset" ? target.profile.avatarId : target?.learner.avatarId;
    const lineId = phase === "enter" ? "assist.enter_pin" : phase === "create" ? "assist.new_pin" : "pin.confirm";
    const onPin = async (next: string) => {
      setPin(next);
      if (next.length < 4) return;
      if (phase === "enter") return void submit({ pin: next });
      if (phase === "create") {
        setFirst(next);
        setPin("");
        setPhase("confirm");
        return void say("pin.confirm");
      }
      if (next !== first) {
        setFirst("");
        setPin("");
        setPhase("create");
        return void say("pin.mismatch");
      }
      return void submit({ newPin: next });
    };
    return (
      <Screen label="secret code" className="gap-4 py-4">
        <div className="flex items-start gap-3">
          <ListenButton onListen={() => void say(lineId)} />
          <Caption line={lines?.[lineId]} always />
        </div>
        {avatar && <Picture src={`/images/${avatar}.svg`} className="mx-auto h-20 w-20" />}
        <PinPad value={pin} onChange={(v) => void onPin(v)} />
        {phase === "enter" && (
          <button
            type="button"
            data-testid="assist-forgot"
            aria-label={lines?.["assist.forgot"]?.label ?? "forgot"}
            onClick={() => {
              setPin("");
              setPhase("create");
              void say("assist.new_pin");
            }}
            className="mx-auto flex min-h-14 items-center gap-2 rounded-2xl border-2 border-line bg-white px-5 text-lg font-bold"
          >
            {lines?.["assist.forgot"]?.label}
          </button>
        )}
      </Screen>
    );
  }

  if (phase === "saving") return <Spinner />;

  if (phase === "done")
    return (
      <Screen label="done" className="items-center justify-center gap-6 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-good text-white">
          <IconCheck size={64} />
        </span>
        <Caption line={lines?.[target?.kind === "transfer" ? "assist.moved" : "pin.saved"]} always className="items-center" />
        <button
          type="button"
          data-testid="assist-finish"
          onClick={() => void leave("/home")}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-primary text-white"
          aria-label="continue"
        >
          <IconCheck size={32} />
        </button>
      </Screen>
    );

  /* ---------------- facilitator's part (plain text) ---------------- */
  return (
    <Screen label="facilitator help" className="gap-4 py-4">
      <div className="flex items-center gap-2">
        <button type="button" data-testid="back" aria-label="back" onClick={() => void leave(profileId ? `/pin/${profileId}` : "/profiles")} className="flex h-12 w-12 items-center justify-center rounded-full text-ink-soft">
          <IconBack />
        </button>
        <IconTeacher size={28} className="text-primary" />
        <h1 className="text-xl font-bold">Facilitator help</h1>
      </div>

      {message && (
        <p role="alert" className="rounded-2xl bg-accent-soft p-3 font-semibold" data-testid="assist-message">
          {message}
        </p>
      )}

      {phase === "signin" && <SignIn online={online} onSignedIn={(f) => {
        signOutRef.current = f.signOut;
        setFacilitator(f);
        setPhase("choose");
      }} />}

      {phase === "choose" && facilitator && (
        <Choose facilitator={facilitator} profiles={profiles} fromPinScreen={fromPinScreen} onChoose={choose} />
      )}

      {phase === "handover" && target && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3">
            <Picture src={`/images/${target.kind === "reset" ? target.profile.avatarId : target.learner.avatarId}.svg`} className="h-16 w-16" />
            <p className="font-semibold">
              {target.kind === "reset" ? (target.profile.nickname ?? "This learner") : (target.learner.nickname ?? "Learner")}
              {target.kind === "transfer" && <span className="block text-sm text-ink-soft">{target.cohort}</span>}
            </p>
          </div>
          <p className="text-lg">
            Give the phone to the learner and look away.{" "}
            {target.kind === "transfer"
              ? "They will enter their secret PIN (or choose a new one if they have forgotten it). Their saved progress then moves to this phone, and their old phone is signed out."
              : "They will choose a new secret PIN. Their progress is kept."}
          </p>
          <button
            type="button"
            data-testid="assist-ready"
            onClick={() => {
              const next = target.kind === "transfer" ? "enter" : "create";
              setPhase(next);
              void say(next === "enter" ? "assist.enter_pin" : "assist.new_pin");
            }}
            className="min-h-14 rounded-2xl bg-primary px-5 text-lg font-bold text-white"
          >
            The learner has the phone
          </button>
          <button type="button" onClick={() => setPhase("choose")} className="min-h-12 rounded-2xl border-2 border-line bg-white px-5 font-semibold">
            Choose someone else
          </button>
        </div>
      )}
    </Screen>
  );
}

function SignIn({ online, onSignedIn }: { online: boolean; onSignedIn: (f: Facilitator) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!backendConfigured())
    return <p className="rounded-2xl bg-white p-3">Online features are not set up on this server, so facilitator help is not available.</p>;
  if (!online)
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-white p-3" data-testid="assist-offline">
        <IconOffline size={28} /> Facilitator help needs the internet. Connect and try again.
      </p>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await facilitatorSignIn(email.trim(), password);
      try {
        const { cohorts } = await api<{ cohorts: AssistCohort[] }>(null, "/api/assist/learners", { token: session.token });
        onSignedIn({ ...session, cohorts });
      } catch (err) {
        await session.signOut();
        throw err;
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : err instanceof Error ? err.message : "error";
      setError(
        code === "invalid_credentials"
          ? "Email or password is not correct."
          : code === "forbidden"
            ? "This account is not a facilitator account."
            : code === "network"
              ? "No internet connection."
              : "Sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <p>Sign in with your facilitator account. You will stay signed in only while you help, and nothing about you is saved on this phone.</p>
      <label className="flex flex-col gap-1 font-semibold">
        Email
        <input
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="assist-email"
          className="min-h-12 rounded-xl border-2 border-line bg-white px-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Password
        <input
          type="password"
          required
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="assist-password"
          className="min-h-12 rounded-xl border-2 border-line bg-white px-3 font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="font-semibold text-danger" data-testid="assist-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} data-testid="assist-signin" className="min-h-14 rounded-2xl bg-primary px-5 text-lg font-bold text-white disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function Choose({
  facilitator,
  profiles,
  fromPinScreen,
  onChoose,
}: {
  facilitator: Facilitator;
  profiles: StoredProfile[];
  fromPinScreen: StoredProfile | null;
  onChoose: (t: Target) => void;
}) {
  const inMyCohorts = (learnerId: string) => facilitator.cohorts.some((c) => c.learners.some((l) => l.learnerId === learnerId));
  const canReset = (p: StoredProfile) => !p.learnerId || inMyCohorts(p.learnerId);
  const local = fromPinScreen ? [fromPinScreen] : profiles;
  const onThisPhone = new Set(profiles.map((p) => p.learnerId).filter(Boolean));

  const card = (key: string, avatarId: string, title: string, sub: string | null, onClick: (() => void) | null, testId: string) => (
    <li key={key}>
      <button
        type="button"
        data-testid={testId}
        disabled={!onClick}
        onClick={onClick ?? undefined}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-line bg-white p-3 text-left disabled:opacity-60"
      >
        <Picture src={`/images/${avatarId}.svg`} className="h-14 w-14" />
        <span className="flex flex-col">
          <span className="font-bold">{title}</span>
          {sub && <span className="text-sm text-ink-soft">{sub}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Reset a forgotten PIN</h2>
        <ul className="flex flex-col gap-2">
          {local.map((p) =>
            card(
              p.id,
              p.avatarId,
              p.nickname ?? "Learner on this phone",
              !p.learnerId ? "Progress saved on this phone only" : canReset(p) ? "In your class" : "Not in one of your classes: ask their own facilitator",
              canReset(p) ? () => onChoose({ kind: "reset", profile: p }) : null,
              `assist-reset-${p.avatarId}`,
            ),
          )}
          {local.length === 0 && <li className="text-ink-soft">No learners on this phone yet.</li>}
        </ul>
      </section>
      {!fromPinScreen && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Bring a learner to this phone</h2>
          <p className="text-sm text-ink-soft">For a learner with a new or replacement phone. Their saved progress is downloaded here.</p>
          {facilitator.cohorts.length === 0 && <p className="text-ink-soft">You have no classes yet.</p>}
          {facilitator.cohorts.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <h3 className="font-semibold">{c.name}</h3>
              <ul className="flex flex-col gap-2">
                {c.learners
                  .filter((l) => !onThisPhone.has(l.learnerId))
                  .map((l) =>
                    card(
                      `${c.id}-${l.learnerId}`,
                      l.avatarId,
                      l.nickname ?? "Learner without a nickname",
                      l.language === "zu" ? "isiZulu" : "Sesotho",
                      () => onChoose({ kind: "transfer", learner: l, cohort: c.name }),
                      `assist-transfer-${l.learnerId}`,
                    ),
                  )}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

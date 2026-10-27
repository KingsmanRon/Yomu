"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { APP_NAME } from "@/config/app";
import { staffApi, staffClient } from "./client";
import { useStaff } from "./StaffProvider";
import { Button, Card, Field, Notice, inputClass } from "./ui";

type Step = "checking" | "enrol" | "verify" | "codes" | "ready";

const WRONG_CODE = "That code is not correct. Check that the time on your phone is right and type the newest code.";

/**
 * Two-step sign-in is required for every staff account: the staff pages open
 * only at Authenticator Assurance Level 2 (password and a code from an
 * authenticator app), and the server and the database check the same. The
 * first sign-in sets up the authenticator and recovery codes. Learners never
 * see this: they keep their picture and secret code.
 */
export function TwoStepGate({ children }: { children: ReactNode }) {
  const { session } = useStaff();
  const [step, setStep] = useState<Step>("checking");
  const [notice, setNotice] = useState<string | null>(null);
  const token = session?.access_token;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await staffClient().auth.mfa.getAuthenticatorAssuranceLevel();
      let next: Step = data?.currentLevel === "aal2" ? "ready" : data?.nextLevel === "aal2" ? "verify" : "enrol";
      if (next === "ready") {
        // Everyone keeps recovery codes: new ones are made when none are left.
        const { remaining } = await staffApi<{ remaining: number }>("/api/staff/mfa/recovery-codes").catch(() => ({ remaining: -1 }));
        if (remaining === 0) next = "codes";
      }
      // Codes on screen stay until the staff member says they are saved.
      if (!cancelled) setStep((current) => (current === "codes" && next === "ready" ? current : next));
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (step === "checking") return <p className="text-ink-soft">Loading…</p>;
  if (step === "enrol") return <Enrol notice={notice} />;
  if (step === "verify") return <Verify onRecovered={() => setNotice("Recovery code accepted. Your old authenticator was removed and your other sessions were signed out. Set up your new authenticator now.")} />;
  if (step === "codes") return <RecoveryCodes onDone={() => setStep("ready")} />;
  return <>{children}</>;
}

function Enrol({ notice }: { notice: string | null }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const mfa = staffClient().auth.mfa;
      // A set-up left unfinished (the page was closed before the code) is replaced.
      const { data: list } = await mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === "unverified") await mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await mfa.enroll({ factorType: "totp", issuer: APP_NAME });
      if (e || !data) setError(e?.message ?? "The set-up could not start. Reload the page to try again.");
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  const verify = async (code: string) => {
    if (!factor) return null;
    const { error: e } = await staffClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    return e ? WRONG_CODE : null;
  };

  return (
    <Card title="Set up two-step sign-in" testId="mfa-enrol">
      {notice && <Notice>{notice}</Notice>}
      <p className="text-sm">
        Staff accounts can see learners&apos; information, so every sign-in needs your password and a code from an authenticator app on your phone (any app
        that supports time-based codes). This takes a minute, once.
      </p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>Open your authenticator app and add an account by scanning this code.</li>
        <li>If you cannot scan it, type the key below into the app instead.</li>
        <li>Type the six-digit code the app shows.</li>
      </ol>
      {error && <Notice tone="error">{error}</Notice>}
      {factor ? (
        <>
          {/* A data URL from Auth: nothing to optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={factor.qr} alt="QR code to add your account to an authenticator app" className="h-48 w-48 self-start rounded-xl border border-line bg-white p-2" />
          <p className="text-sm">
            Key:{" "}
            <span className="break-all font-mono text-base tracking-wider" data-testid="mfa-secret">
              {factor.secret.match(/.{1,4}/g)?.join(" ")}
            </span>
          </p>
          <CodeForm onSubmit={verify} />
        </>
      ) : (
        !error && <p className="text-ink-soft">Preparing…</p>
      )}
    </Card>
  );
}

function Verify({ onRecovered }: { onRecovered: () => void }) {
  const [lost, setLost] = useState(false);

  const verify = async (code: string) => {
    const mfa = staffClient().auth.mfa;
    const { data } = await mfa.listFactors();
    const factor = data?.totp[0];
    if (!factor) return "No authenticator was found for this account. Sign out and sign in again.";
    const { error } = await mfa.challengeAndVerify({ factorId: factor.id, code });
    return error ? WRONG_CODE : null;
  };

  return (
    <Card title="Two-step sign-in" testId="mfa-verify-step">
      {!lost ? (
        <>
          <p className="text-sm">Type the six-digit code from your authenticator app.</p>
          <CodeForm onSubmit={verify} />
          <button type="button" onClick={() => setLost(true)} className="w-fit text-sm font-semibold text-primary underline" data-testid="mfa-lost">
            I cannot use my authenticator app
          </button>
        </>
      ) : (
        <Recover onRecovered={onRecovered} onBack={() => setLost(false)} />
      )}
    </Card>
  );
}

function Recover({ onRecovered, onBack }: { onRecovered: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await staffApi("/api/staff/mfa/recover", { body: { code } });
      onRecovered();
      // Picks up that the old authenticator is gone, which leads to setting up a new one.
      await staffClient().auth.refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <p className="text-sm">
        Type one of the recovery codes you saved when you set up two-step sign-in. Your old authenticator is then removed, every other session of your account
        is signed out, and you set up a new authenticator. Without a recovery code, ask a platform administrator to reset your two-step sign-in.
      </p>
      <Field label="Recovery code">
        <input value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" spellCheck={false} className={`${inputClass} font-mono`} data-testid="recovery-code" />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} data-testid="recovery-use">
          {busy ? "Checking…" : "Use recovery code"}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}

function CodeForm({ onSubmit }: { onSubmit: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onSubmit(code.replace(/\s/g, "")).catch(() => "No connection. Try again.");
    setBusy(false);
    if (message) {
      setError(message);
      setCode("");
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <Field label="Six-digit code">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          className={`${inputClass} w-40 font-mono tracking-widest`}
          data-testid="mfa-code"
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="w-fit" data-testid="mfa-verify">
        {busy ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

/** New recovery codes (replacing any earlier ones), shown once. */
function RecoveryCodes({ onDone }: { onDone: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    staffApi<{ codes: string[] }>("/api/staff/mfa/recovery-codes", { method: "POST" }).then(
      (r) => setCodes(r.codes),
      (e: Error) => setError(e.message),
    );
  }, []);

  const download = () => {
    const text = `${APP_NAME} staff recovery codes (each works once)\n\n${codes?.join("\n") ?? ""}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${APP_NAME.toLowerCase()}-recovery-codes.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Card title="Your recovery codes" testId="recovery-step">
      <p className="text-sm">
        If you lose the phone with your authenticator app, one of these codes lets you back in. Each code works once. Keep them somewhere safe and away from
        that phone (printed, or in a password manager). They are shown only now; any earlier codes no longer work.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {codes ? (
        <>
          <ol className="grid grid-cols-2 gap-2 font-mono text-base sm:grid-cols-3" data-testid="recovery-codes">
            {codes.map((c) => (
              <li key={c} className="rounded-lg bg-paper px-2 py-1">
                {c}
              </li>
            ))}
          </ol>
          <Button variant="secondary" onClick={download} className="w-fit">
            Download as a text file
          </Button>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-5 w-5" data-testid="recovery-saved-check" />I have
            saved these codes somewhere safe
          </label>
          <Button onClick={onDone} disabled={!saved} className="w-fit" data-testid="recovery-saved">
            Continue
          </Button>
        </>
      ) : (
        !error && <p className="text-ink-soft">Creating codes…</p>
      )}
    </Card>
  );
}

/** For every staff member: how many recovery codes are left, and new ones. */
export function TwoStepCard() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    if (replacing) return;
    let cancelled = false;
    staffApi<{ remaining: number }>("/api/staff/mfa/recovery-codes").then(
      (r) => !cancelled && setRemaining(r.remaining),
      () => !cancelled && setRemaining(null),
    );
    return () => {
      cancelled = true;
    };
  }, [replacing]);

  if (replacing) return <RecoveryCodes onDone={() => setReplacing(false)} />;
  return (
    <Card title="Two-step sign-in" testId="two-step-card">
      <p className="text-sm text-ink-soft">
        Your account is protected by your authenticator app.
        {remaining !== null && ` You have ${remaining} unused recovery ${remaining === 1 ? "code" : "codes"}.`} Make new codes if you used most of them or think
        someone else has seen them; the old ones then stop working.
      </p>
      <Button variant="secondary" onClick={() => setReplacing(true)} className="w-fit" data-testid="recovery-new">
        Make new recovery codes
      </Button>
    </Card>
  );
}

/** Platform administrators: reset another staff member's two-step sign-in. */
export function TwoStepResetCard() {
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await staffApi("/api/admin/staff-mfa-reset", { body: { email: email.trim() } });
      setResult({ tone: "info", text: `Two-step sign-in was reset for ${email.trim()}. All their sessions were signed out; they set up a new authenticator at their next sign-in.` });
      setEmail("");
      setConfirmed(false);
    } catch (err) {
      setResult({ tone: "error", text: err instanceof Error ? err.message : "The reset failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Reset a staff member's two-step sign-in" testId="mfa-reset-card">
      <p className="text-sm text-ink-soft">
        For a staff member who lost their authenticator and their recovery codes. Their authenticator, recovery codes and sessions are removed, and the reset
        is recorded. Someone who knows only their password must not be able to get this, so first confirm who is asking through another channel (in person,
        or a call to a number you already have).
      </p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <Field label="Staff member's email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} data-testid="mfa-reset-email" />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-5 w-5" data-testid="mfa-reset-confirm" />I
          confirmed who is asking through another channel
        </label>
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
        <Button type="submit" variant="danger" disabled={busy || !confirmed} className="w-fit" data-testid="mfa-reset">
          {busy ? "Resetting…" : "Reset two-step sign-in"}
        </Button>
      </form>
    </Card>
  );
}

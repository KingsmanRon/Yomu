"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { APP_NAME, backendConfigured } from "@/config/app";
import { StaffProvider, useStaff } from "./StaffProvider";
import { TwoStepGate } from "./TwoStep";
import { Button, Field, Notice, inputClass } from "./ui";

export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <StaffProvider>
      <Frame>{children}</Frame>
    </StaffProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { ready, session, roles, signOut } = useStaff();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link href="/staff" className="text-lg font-bold text-primary">
            {APP_NAME} · staff
          </Link>
          {session && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-ink-soft" data-testid="staff-user">
                {roles[0]?.display_name ?? session.user.email}
              </span>
              <Button variant="secondary" onClick={() => void signOut()} data-testid="staff-signout">
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        {!backendConfigured() ? (
          <Notice tone="warn">Online features are not set up on this server (Supabase is not configured).</Notice>
        ) : !ready ? (
          <p className="text-ink-soft">Loading…</p>
        ) : !session ? (
          <SignIn />
        ) : roles.length === 0 ? (
          <Notice tone="warn">This account has no staff role yet. Ask a platform administrator to add you to an organisation.</Notice>
        ) : (
          <TwoStepGate>{children}</TwoStepGate>
        )}
      </main>
    </div>
  );
}

function SignIn() {
  const { signIn } = useStaff();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email.trim(), password));
    setBusy(false);
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="text-sm text-ink-soft">
        For facilitators, organisation administrators and content reviewers. After your password you also need a code from an authenticator app. Learners use
        the app itself and never need an email address.
      </p>
      <Field label="Email">
        <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} data-testid="staff-email" />
      </Field>
      <Field label="Password">
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} data-testid="staff-password" />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} data-testid="staff-signin">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

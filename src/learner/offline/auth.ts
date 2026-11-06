import type { GoTrueClient } from "@supabase/auth-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, backendConfigured } from "@/config/app";

/**
 * One Supabase Auth session per device profile, each under its own storage
 * key, so learners sharing a phone never share a session. The auth library is
 * loaded only when a learner saves progress online, keeping the first screen
 * small.
 */
const clients = new Map<string, GoTrueClient>();

export function storageKeyFor(profileId: string): string {
  return `yomu-auth-${profileId}`;
}

export async function authFor(profileId: string): Promise<GoTrueClient> {
  if (!backendConfigured()) throw new Error("backend_not_configured");
  const existing = clients.get(profileId);
  if (existing) return existing;
  const { AuthClient } = await import("@supabase/auth-js");
  const client = new AuthClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    storageKey: storageKeyFor(profileId),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  });
  clients.set(profileId, client);
  return client;
}

/** Access token for the profile's session, refreshed if needed; null when signed out or offline. */
export async function accessToken(profileId: string): Promise<string | null> {
  try {
    const client = await authFor(profileId);
    const { data } = await client.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Creates the anonymous Auth user. Called only after the learner agreed to the spoken consent. */
export async function signInAnonymously(profileId: string): Promise<string> {
  const client = await authFor(profileId);
  const { data, error } = await client.signInAnonymously();
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session.access_token;
}

/** Forget the session on this phone (switching learner, deletion). */
export async function forgetSession(profileId: string): Promise<void> {
  const client = clients.get(profileId);
  clients.delete(profileId);
  try {
    await client?.signOut({ scope: "local" });
  } catch {
    // Offline sign-out still clears local storage below.
  }
  try {
    localStorage.removeItem(storageKeyFor(profileId));
  } catch {
    // Storage unavailable.
  }
}

export interface FacilitatorSession {
  token: string;
  signOut: () => Promise<void>;
}

export interface PendingFacilitatorSignIn {
  /** The code from the facilitator's authenticator app; throws "mfa_code_wrong" or "network". */
  verify: (code: string) => Promise<FacilitatorSession>;
  cancel: () => Promise<void>;
}

/**
 * Facilitator sign-in for assisted mode on a learner's phone, in two steps:
 * the password, then a code from the facilitator's authenticator app (staff
 * access needs both; accounts without an authenticator are refused with
 * "mfa_not_set_up"). The session is held in memory only (never written to the
 * phone's storage) and is ended with `signOut` as soon as the help is
 * finished.
 */
export async function facilitatorSignIn(email: string, password: string): Promise<PendingFacilitatorSignIn> {
  if (!backendConfigured()) throw new Error("backend_not_configured");
  const { AuthClient } = await import("@supabase/auth-js");
  const client = new AuthClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    storageKey: "yomu-assist",
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
  const offline = (error: { status?: number; name?: string } | null) => error?.status === 0 || error?.name === "AuthRetryableFetchError";
  let result: Awaited<ReturnType<GoTrueClient["signInWithPassword"]>>;
  try {
    result = await client.signInWithPassword({ email, password });
  } catch {
    throw new Error("network");
  }
  if (result.error || !result.data.session) throw new Error(offline(result.error) ? "network" : "invalid_credentials");
  const signOut = async () => {
    try {
      await client.signOut({ scope: "local" });
    } catch {
      // The in-memory session is dropped with the page in any case.
    }
  };
  const factor = result.data.user?.factors?.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor) {
    await signOut();
    throw new Error("mfa_not_set_up");
  }
  return {
    verify: async (code) => {
      let verified: Awaited<ReturnType<GoTrueClient["mfa"]["challengeAndVerify"]>>;
      try {
        verified = await client.mfa.challengeAndVerify({ factorId: factor.id, code });
      } catch {
        throw new Error("network");
      }
      if (verified.error || !verified.data) throw new Error(offline(verified.error) ? "network" : "mfa_code_wrong");
      return { token: verified.data.access_token, signOut };
    },
    cancel: signOut,
  };
}

/**
 * Only the active profile's session refreshes in the background. Clients stay
 * cached (one per storage key), so switching back to a learner reuses theirs.
 */
export function pauseOtherSessions(activeProfileId: string | null): void {
  for (const [id, client] of clients) {
    if (id === activeProfileId) void client.startAutoRefresh();
    else void client.stopAutoRefresh();
  }
}

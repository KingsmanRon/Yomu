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

/**
 * Facilitator sign-in for assisted mode on a learner's phone. The session is
 * held in memory only (never written to the phone's storage) and is ended
 * with `signOut` as soon as the help is finished.
 */
export async function facilitatorSignIn(email: string, password: string): Promise<{ token: string; signOut: () => Promise<void> }> {
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
  let result: Awaited<ReturnType<GoTrueClient["signInWithPassword"]>>;
  try {
    result = await client.signInWithPassword({ email, password });
  } catch {
    throw new Error("network");
  }
  if (result.error || !result.data.session) {
    throw new Error(result.error?.status === 0 || result.error?.name === "AuthRetryableFetchError" ? "network" : "invalid_credentials");
  }
  return {
    token: result.data.session.access_token,
    signOut: async () => {
      try {
        await client.signOut({ scope: "local" });
      } catch {
        // The in-memory session is dropped with the page in any case.
      }
    },
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

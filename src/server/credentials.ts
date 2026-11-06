import "server-only";
import { verifyPin } from "./pin";
import { supabaseAdmin } from "./supabase";

export type PinCheck =
  | { ok: true; verifiedHash: string }
  | { ok: false; reason: "wrong" | "no_credentials" }
  | { ok: false; reason: "wait"; retryAfter: string };

/**
 * Check a learner's PIN on the server. The attempt is counted, and any wait
 * started, in the database before the PIN is verified (pin_attempt_begin), so
 * parallel guesses are limited like sequential ones. After a correct PIN the
 * caller must finish with `pinAttemptSucceeded`, which clears the count.
 */
export async function checkLearnerPin(learnerId: string, pin: string): Promise<PinCheck> {
  const { data, error } = await supabaseAdmin().rpc("pin_attempt_begin", { p_learner: learnerId });
  if (error) throw error;
  const r = data as { status: "check" | "wait" | "no_credentials"; pinHash?: string; retryAfter?: string };
  if (r.status === "wait") return { ok: false, reason: "wait", retryAfter: r.retryAfter ?? new Date().toISOString() };
  if (r.status !== "check" || !r.pinHash) return { ok: false, reason: "no_credentials" };
  if (!(await verifyPin(pin, r.pinHash))) return { ok: false, reason: "wrong" };
  return { ok: true, verifiedHash: r.pinHash };
}

/**
 * Clear the attempt count after a correct PIN and, when given, store a new
 * PIN hash. False when the PIN changed since it was verified (for example a
 * facilitator reset it in between).
 */
export async function pinAttemptSucceeded(learnerId: string, verifiedHash: string, newHash?: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("pin_attempt_succeeded", {
    p_learner: learnerId,
    p_verified_hash: verifiedHash,
    p_new_hash: newHash ?? null,
  });
  if (error) throw error;
  return data === true;
}

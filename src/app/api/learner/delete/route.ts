import { handler, json } from "@/server/http";
import { requireLearner, supabaseAdmin } from "@/server/supabase";

/**
 * Learner-initiated deletion (POPIA): removes the learner and everything
 * linked to them (progress, attempts, consents, memberships, tutor logs,
 * moves, pseudonymous analytics and error logs) and their anonymous Auth user
 * with its sessions, in one database transaction. Completed immediately,
 * without contacting support. The device clears its own copy (or keeps it as
 * a phone-only guest profile when the learner only withdrew consent to
 * online storage). A repeated request after a lost reply gets 403
 * not_registered, which the app treats as done.
 */
export const POST = handler(async (request) => {
  const { user, learner } = await requireLearner(request);
  const db = supabaseAdmin();
  const { error } = await db.rpc("delete_learner", { p_learner: learner.id, p_initiated_by: "learner" });
  if (error) throw error;
  // Normally already gone with the learner; this covers an Auth user the
  // transaction could not delete (the retention job is the last resort).
  const { error: authError } = await db.auth.admin.deleteUser(user.id);
  if (authError && authError.status !== 404) throw authError;
  return json({ deleted: true });
});

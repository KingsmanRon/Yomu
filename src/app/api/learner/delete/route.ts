import { handler, json } from "@/server/http";
import { requireLearner, supabaseAdmin } from "@/server/supabase";

/**
 * Learner-initiated deletion (POPIA): removes the learner and everything
 * linked to them (progress, attempts, consents, memberships, tutor logs,
 * pseudonymous analytics and error logs), then the Supabase Auth user.
 * Completed immediately, without contacting support. The device clears its
 * own copy (or keeps it as a phone-only guest profile when the learner only
 * withdrew consent to online storage).
 */
export const POST = handler(async (request) => {
  const { user, learner } = await requireLearner(request);
  const db = supabaseAdmin();
  const { error } = await db.rpc("delete_learner", { p_learner: learner.id, p_initiated_by: "learner" });
  if (error) throw error;
  const { error: authError } = await db.auth.admin.deleteUser(user.id);
  if (authError) throw authError;
  return json({ deleted: true });
});

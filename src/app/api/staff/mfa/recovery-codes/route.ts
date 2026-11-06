import { handler, json } from "@/server/http";
import { RECOVERY_CODE_COUNT, newRecoveryCode, recoveryCodeHash } from "@/server/mfa";
import { ALL_STAFF_ROLES, requireStaff, supabaseAdmin } from "@/server/supabase";

/** How many unused recovery codes the signed-in staff member has left. */
export const GET = handler(async (request) => {
  const { user } = await requireStaff(request, ALL_STAFF_ROLES);
  const { count, error } = await supabaseAdmin()
    .from("staff_mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("used_at", null);
  if (error) throw error;
  return json({ remaining: count ?? 0 });
});

/**
 * New recovery codes for the signed-in staff member, replacing any earlier
 * ones. Needs a session with the second factor, so a password alone cannot
 * create codes. The codes are in this reply only.
 */
export const POST = handler(async (request) => {
  const { user } = await requireStaff(request, ALL_STAFF_ROLES);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  const { error } = await supabaseAdmin().rpc("staff_mfa_issue_recovery_codes", {
    p_user: user.id,
    p_hashes: codes.map((c) => recoveryCodeHash(user.id, c)),
  });
  if (error) throw error;
  return json({ codes });
});

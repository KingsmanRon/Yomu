import { z } from "zod";
import { handler, json, readJson } from "@/server/http";
import { HttpError, requireStaff, supabaseAdmin } from "@/server/supabase";

const Body = z.object({ email: z.email().max(320) }).strict();

/**
 * A platform administrator resets another staff member's two-step sign-in,
 * after confirming who they are by another channel: their authenticators,
 * recovery codes and sessions are removed in one transaction and the reset is
 * recorded. They set up a new authenticator at their next sign-in.
 */
export const POST = handler(async (request) => {
  const { user } = await requireStaff(request, ["platform_admin"]);
  const { email } = Body.parse(await readJson(request));
  const { data, error } = await supabaseAdmin().rpc("staff_mfa_reset", { p_admin: user.id, p_email: email });
  if (error) throw error;
  const failure = (data as { error?: string }).error;
  if (failure === "not_staff") throw new HttpError(404, "not_staff", "No staff account has this email address.");
  if (failure === "own_account") throw new HttpError(400, "own_account", "You cannot reset your own account: use a recovery code, or ask another platform administrator.");
  if (failure) throw new HttpError(403, failure);
  return json({ ok: true });
});

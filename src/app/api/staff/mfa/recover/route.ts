import { z } from "zod";
import { handler, json, readJson } from "@/server/http";
import { recoveryCodeHash } from "@/server/mfa";
import { HttpError, requireStaffSession, supabaseAdmin } from "@/server/supabase";

const Body = z.object({ code: z.string().min(1).max(64) }).strict();

/**
 * A staff member who lost their authenticator signs in with their password
 * and uses one recovery code. In one transaction the code is spent, their
 * authenticators are removed and every other session is ended (the lost
 * phone may be in someone else's hands); they then set up a new
 * authenticator. At most 5 wrong codes per 15 minutes, each recorded.
 */
export const POST = handler(async (request) => {
  const { user, sessionId } = await requireStaffSession(request);
  if (!sessionId) throw new HttpError(401, "unauthenticated");
  const { code } = Body.parse(await readJson(request));
  const { data, error } = await supabaseAdmin().rpc("staff_mfa_recover", {
    p_user: user.id,
    p_code_hash: recoveryCodeHash(user.id, code),
    p_session: sessionId,
  });
  if (error) throw error;
  const result = data as { status: "ok" | "wrong" | "wait"; remaining?: number };
  if (result.status === "wait") throw new HttpError(429, "recovery_wait", "Too many wrong codes. Try again in 15 minutes, or ask a platform administrator.");
  if (result.status === "wrong") throw new HttpError(403, "recovery_code_wrong", "This recovery code is not correct, or it was already used.");
  return json({ remaining: result.remaining ?? 0 });
});

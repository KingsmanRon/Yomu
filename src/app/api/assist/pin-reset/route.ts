import { z } from "zod";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin } from "@/server/pin";
import { HttpError, requireStaff, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    learnerId: z.uuid(),
    newPin: z.string().refine(isValidPin),
  })
  .strict();

/**
 * Reset a forgotten PIN with a facilitator present. The new PIN is chosen by
 * the learner on the learner's own screen; the request carries the
 * facilitator's session, which is what authorises it. The database checks
 * that the facilitator runs a live class the learner belongs to (in the
 * class's organisation), changes the PIN and writes the audit record in one
 * transaction.
 */
export const POST = handler(async (request) => {
  const { user } = await requireStaff(request, ["facilitator"]);
  const body = Body.parse(await readJson(request));
  const { data, error } = await supabaseAdmin().rpc("assist_reset_pin", {
    p_facilitator: user.id,
    p_learner: body.learnerId,
    p_pin_hash: await hashPin(body.newPin),
  });
  if (error) throw error;
  const result = data as { ok?: boolean; error?: string };
  if (result.error === "not_your_learner") throw new HttpError(403, "not_your_learner");
  if (result.error) throw new HttpError(404, result.error);
  return json({ ok: true });
});

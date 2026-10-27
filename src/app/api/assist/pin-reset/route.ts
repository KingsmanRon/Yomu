import { z } from "zod";
import { recordAssist, requireFacilitatorOf } from "@/server/assist";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin } from "@/server/pin";
import { supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    learnerId: z.uuid(),
    newPin: z.string().refine(isValidPin),
  })
  .strict();

/**
 * Reset a forgotten PIN with a facilitator present. The new PIN is chosen by
 * the learner on the learner's own screen; the request carries the
 * facilitator's session, which is what authorises it.
 */
export const POST = handler(async (request) => {
  const body = Body.parse(await readJson(request));
  const { userId, cohortId } = await requireFacilitatorOf(request, body.learnerId);
  const { error } = await supabaseAdmin()
    .from("learner_credentials")
    .update({ pin_hash: await hashPin(body.newPin), failed_attempts: 0, retry_after: null, updated_at: new Date().toISOString() })
    .eq("learner_id", body.learnerId);
  if (error) throw error;
  await recordAssist(body.learnerId, userId, cohortId, "pin_reset");
  return json({ ok: true });
});

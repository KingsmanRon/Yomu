import { z } from "zod";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin, pinRetryDelaySeconds, verifyPin } from "@/server/pin";
import { HttpError, requireLearner, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    currentPin: z.string().refine(isValidPin),
    newPin: z.string().refine(isValidPin),
  })
  .strict();

/**
 * Change the picture PIN. The current PIN is verified on the server, with an
 * increasing wait after repeated wrong attempts (never a lockout from learning:
 * the learner keeps using the app on the device meanwhile).
 */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = Body.parse(await readJson(request));
  const db = supabaseAdmin();
  const { data: cred, error } = await db
    .from("learner_credentials")
    .select("pin_hash, failed_attempts, retry_after")
    .eq("learner_id", learner.id)
    .single();
  if (error) throw error;
  if (cred.retry_after && new Date(cred.retry_after).getTime() > Date.now()) {
    throw new HttpError(429, "pin_wait");
  }
  if (!(await verifyPin(body.currentPin, cred.pin_hash))) {
    const failed = cred.failed_attempts + 1;
    const delay = pinRetryDelaySeconds(failed);
    await db
      .from("learner_credentials")
      .update({ failed_attempts: failed, retry_after: delay ? new Date(Date.now() + delay * 1000).toISOString() : null })
      .eq("learner_id", learner.id);
    throw new HttpError(403, "pin_wrong");
  }
  await db
    .from("learner_credentials")
    .update({ pin_hash: await hashPin(body.newPin), failed_attempts: 0, retry_after: null, updated_at: new Date().toISOString() })
    .eq("learner_id", learner.id);
  return json({ ok: true });
});

import { z } from "zod";
import { recordAssist, requireFacilitatorOf } from "@/server/assist";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin, pinRetryDelaySeconds, verifyPin } from "@/server/pin";
import { HttpError, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    learnerId: z.uuid(),
    deviceProfileId: z.uuid(),
    /** Session of the anonymous user just created on the new phone. */
    deviceToken: z.string().min(20),
    /** The learner's current PIN, entered by the learner... */
    pin: z.string().refine(isValidPin).optional(),
    /** ...or, when it is forgotten, a new PIN the learner chooses. */
    newPin: z.string().refine(isValidPin).optional(),
  })
  .strict()
  .refine((b) => (b.pin === undefined) !== (b.newPin === undefined), "exactly one of pin and newPin");

/**
 * Move a learner to a new phone with a facilitator present. The learner's
 * account is re-bound to the new phone's session and the old phone's session
 * is revoked (a lost or stolen phone can no longer read or change progress).
 * All progress is kept on the server; the new phone downloads it on its first
 * sync.
 */
export const POST = handler(async (request) => {
  const body = Body.parse(await readJson(request));
  const { userId, cohortId } = await requireFacilitatorOf(request, body.learnerId);
  const db = supabaseAdmin();

  const { data: deviceUser, error: devErr } = await db.auth.getUser(body.deviceToken);
  if (devErr || !deviceUser.user) throw new HttpError(401, "device_unauthenticated");
  if (!deviceUser.user.is_anonymous) throw new HttpError(400, "device_not_anonymous");
  const { data: bound } = await db.from("learners").select("id").eq("auth_user_id", deviceUser.user.id).maybeSingle();
  if (bound) throw new HttpError(409, "device_already_registered");
  const { data: device } = await db.from("device_profiles").select("learner_id").eq("id", body.deviceProfileId).maybeSingle();
  if (device) throw new HttpError(409, "device_profile_taken");

  const { data: learner, error: lErr } = await db
    .from("learners")
    .select("id, auth_user_id, teaching_language, avatar_id, nickname")
    .eq("id", body.learnerId)
    .single();
  if (lErr) throw lErr;

  if (body.pin !== undefined) {
    const { data: cred, error } = await db.from("learner_credentials").select("pin_hash, failed_attempts, retry_after").eq("learner_id", learner.id).single();
    if (error) throw error;
    if (cred.retry_after && new Date(cred.retry_after).getTime() > Date.now()) {
      return json({ error: "pin_wait", retryAfter: cred.retry_after }, { status: 429 });
    }
    if (!(await verifyPin(body.pin, cred.pin_hash))) {
      const failed = cred.failed_attempts + 1;
      const delay = pinRetryDelaySeconds(failed);
      await db
        .from("learner_credentials")
        .update({ failed_attempts: failed, retry_after: delay ? new Date(Date.now() + delay * 1000).toISOString() : null })
        .eq("learner_id", learner.id);
      throw new HttpError(403, "pin_wrong");
    }
    await db.from("learner_credentials").update({ failed_attempts: 0, retry_after: null }).eq("learner_id", learner.id);
  } else {
    const { error } = await db
      .from("learner_credentials")
      .update({ pin_hash: await hashPin(body.newPin!), failed_attempts: 0, retry_after: null, updated_at: new Date().toISOString() })
      .eq("learner_id", learner.id);
    if (error) throw error;
    await recordAssist(learner.id, userId, cohortId, "pin_reset");
  }

  const { error: bindErr } = await db
    .from("learners")
    .update({ auth_user_id: deviceUser.user.id, updated_at: new Date().toISOString() })
    .eq("id", learner.id);
  if (bindErr) throw bindErr;
  const { error: dpErr } = await db.from("device_profiles").insert({ id: body.deviceProfileId, learner_id: learner.id });
  if (dpErr) throw dpErr;
  await recordAssist(learner.id, userId, cohortId, "device_transfer");

  // Revoke the old phone: its anonymous user existed only to hold this learner.
  if (learner.auth_user_id && learner.auth_user_id !== deviceUser.user.id) {
    const { data: old } = await db.auth.admin.getUserById(learner.auth_user_id);
    if (old.user?.is_anonymous) await db.auth.admin.deleteUser(learner.auth_user_id);
  }

  const { data: analytics } = await db
    .from("consent_records")
    .select("id")
    .eq("learner_id", learner.id)
    .eq("consent_type", "analytics")
    .is("withdrawn_at", null)
    .limit(1);

  return json({
    learnerId: learner.id,
    language: learner.teaching_language,
    avatarId: learner.avatar_id,
    nickname: learner.nickname,
    analyticsConsent: (analytics ?? []).length > 0,
  });
});

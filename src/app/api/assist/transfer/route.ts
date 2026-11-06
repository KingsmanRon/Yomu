import { z } from "zod";
import { facilitatorCohorts } from "@/server/assist";
import { checkLearnerPin, pinAttemptSucceeded } from "@/server/credentials";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin } from "@/server/pin";
import { HttpError, requireStaff, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    /** Idempotency key chosen by the new phone: the same move repeated returns the recorded outcome. */
    transferId: z.uuid(),
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

interface TransferResult {
  transferId: string;
  status: "completed" | "revocation_pending";
  oldSessionRevoked: boolean;
  oldAuthUserId: string | null;
  learnerId: string;
  language: "zu" | "st";
  avatarId: string;
  nickname: string | null;
  analyticsConsent: boolean;
}

const ERRORS: Record<string, [number, string]> = {
  not_your_learner: [403, "This learner is not in one of your classes."],
  learner_moved: [409, "The learner was moved to another phone at the same moment."],
  device_already_registered: [409, "This phone already holds a learner."],
  device_profile_taken: [409, "This phone profile is already in use."],
  device_not_anonymous: [400, "The new phone's session is not a learner session."],
  device_unauthenticated: [401, "The new phone's session is not valid."],
  transfer_id_conflict: [409, "This transfer ID was already used for a different move."],
  pin_changed: [409, "The learner's code changed during the move. Try again."],
  no_credentials: [409, "The learner has no secret code on the server."],
  learner_not_found: [404, "Learner not found."],
};

/**
 * Move a learner to a new phone with a facilitator present.
 *
 * The facilitator is authorised before any PIN attempt is counted. Then one
 * database transaction checks everything again under locks and applies the
 * whole move: the PIN step (verified PIN or a new PIN), binding the learner to
 * the new phone's session, the device link, the audit records, and revoking
 * the old phone (deleting its anonymous Auth user ends its sessions). From the
 * moment of rebinding the old phone can read and change nothing. If the old
 * session cannot be deleted inside the transaction, the move is recorded as
 * 'revocation_pending' and the server retries here (and daily).
 *
 * A repeated request with the same transfer ID (its reply was lost on a
 * weak connection) returns the recorded outcome, so the new phone can always
 * finish; the PIN entered is still checked (as a counted attempt) against the
 * PIN the move left in place.
 */
export const POST = handler(async (request) => {
  const { user } = await requireStaff(request, ["facilitator"]);
  const body = Body.parse(await readJson(request));
  const db = supabaseAdmin();

  const { data: device, error: devErr } = await db.auth.getUser(body.deviceToken);
  if (devErr || !device.user) throw new HttpError(401, "device_unauthenticated");
  if (!device.user.is_anonymous) throw new HttpError(400, "device_not_anonymous");

  // Authorise before counting any PIN attempt: someone who may not help this
  // learner must not be able to use up the learner's attempts.
  const cohorts = await facilitatorCohorts(user.id);
  if (!cohorts.some((c) => c.learners.some((l) => l.learnerId === body.learnerId))) throw new HttpError(403, "not_your_learner");

  const { data: recorded, error: recErr } = await db.from("device_transfers").select("id").eq("id", body.transferId).maybeSingle();
  if (recErr) throw recErr;
  let expectedOldUser: string | null = null;
  if (!recorded) {
    const { data: learner, error } = await db.from("learners").select("auth_user_id").eq("id", body.learnerId).single();
    if (error) throw error;
    expectedOldUser = learner.auth_user_id;
  }

  // The PIN. A repeated request is verified too (against the PIN the move
  // left in place), so the PIN kept on the new phone is always the real one.
  let verifiedHash: string | null = null;
  let newHash: string | null = null;
  if (body.pin !== undefined || recorded) {
    const check = await checkLearnerPin(body.learnerId, body.pin ?? body.newPin!);
    if (!check.ok) {
      if (check.reason === "wait") return json({ error: "pin_wait", retryAfter: check.retryAfter }, { status: 429 });
      if (check.reason === "wrong") throw new HttpError(403, "pin_wrong");
      throw new HttpError(409, "no_credentials");
    }
    verifiedHash = check.verifiedHash;
    if (recorded) await pinAttemptSucceeded(body.learnerId, verifiedHash);
  } else {
    newHash = await hashPin(body.newPin!);
  }

  const { data, error } = await db.rpc("transfer_learner", {
    p_transfer: body.transferId,
    p_facilitator: user.id,
    p_learner: body.learnerId,
    p_new_user: device.user.id,
    p_device_profile: body.deviceProfileId,
    p_expected_old_user: expectedOldUser,
    p_verified_hash: verifiedHash,
    p_new_hash: newHash,
  });
  if (error) throw error;
  const failure = (data as { error?: string }).error;
  if (failure) {
    const [status, message] = ERRORS[failure] ?? [409, failure];
    throw new HttpError(status, failure, message);
  }

  const result = data as TransferResult;
  if (result.status === "revocation_pending" && result.oldAuthUserId) {
    const { error: delErr } = await db.auth.admin.deleteUser(result.oldAuthUserId);
    if (!delErr || delErr.status === 404) {
      const { error: markErr } = await db.rpc("transfer_mark_revoked", { p_transfer: result.transferId });
      if (!markErr) Object.assign(result, { status: "completed", oldSessionRevoked: true });
    }
  }

  const { oldAuthUserId: _internal, ...reply } = result;
  void _internal;
  return json(reply);
});

import { z } from "zod";
import { CONSENT_VERSION } from "@/config/app";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin } from "@/server/pin";
import { HttpError, supabaseAdmin, userFromRequest } from "@/server/supabase";

const Body = z
  .object({
    deviceProfileId: z.uuid(),
    teachingLanguage: z.enum(["zu", "st"]),
    avatarId: z.string().regex(/^avatar-[a-z]+$/),
    pin: z.string().refine(isValidPin, "four digits 1-9"),
    nickname: z.string().trim().min(1).max(40).optional(),
    consent: z
      .object({
        version: z.string(),
        language: z.enum(["zu", "st"]),
        analytics: z.boolean(),
      })
      .strict(),
  })
  .strict();

/**
 * Registers the learner after spoken consent. The device has just signed in
 * anonymously with Supabase Auth; nothing about the learner was stored on the
 * server before this call.
 *
 * Everything is written by one database function in one transaction (learner,
 * hashed PIN, device link, consent records), so a failure leaves nothing
 * behind. Only an anonymous session may register: staff accounts cannot
 * become learners. A repeated call for the same session (a retry after a
 * lost reply) returns the learner already created.
 */
export const POST = handler(async (request) => {
  const { user } = await userFromRequest(request);
  if (!user.is_anonymous) throw new HttpError(403, "not_anonymous");
  const body = Body.parse(await readJson(request));
  if (body.consent.version !== CONSENT_VERSION) throw new HttpError(409, "consent_version_outdated");

  const { data, error } = await supabaseAdmin().rpc("register_learner", {
    p_auth_user: user.id,
    p_device_profile: body.deviceProfileId,
    p_language: body.teachingLanguage,
    p_avatar: body.avatarId,
    p_nickname: body.nickname ?? null,
    p_pin_hash: await hashPin(body.pin),
    p_consent_version: body.consent.version,
    p_consent_language: body.consent.language,
    p_analytics: body.consent.analytics,
  });
  if (error) throw error;
  const result = data as { learnerId?: string; alreadyRegistered?: boolean; error?: string };
  if (result.error === "device_profile_taken") throw new HttpError(409, "device_profile_taken");
  if (result.error) throw new HttpError(403, result.error);
  return json({ learnerId: result.learnerId, alreadyRegistered: result.alreadyRegistered }, { status: result.alreadyRegistered ? 200 : 201 });
});

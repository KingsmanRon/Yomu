import { z } from "zod";
import { CONSENT_VERSION } from "@/config/app";
import { handler, json, readJson } from "@/server/http";
import { recordEvents } from "@/server/observability";
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
 */
export const POST = handler(async (request) => {
  const { user } = await userFromRequest(request);
  const body = Body.parse(await readJson(request));
  if (body.consent.version !== CONSENT_VERSION) throw new HttpError(409, "consent_version_outdated");

  const db = supabaseAdmin();
  const { data: existing } = await db.from("learners").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (existing) return json({ learnerId: existing.id, alreadyRegistered: true });

  const { data: device } = await db.from("device_profiles").select("learner_id").eq("id", body.deviceProfileId).maybeSingle();
  if (device) throw new HttpError(409, "device_profile_taken");

  const { data: learner, error } = await db
    .from("learners")
    .insert({
      auth_user_id: user.id,
      teaching_language: body.teachingLanguage,
      avatar_id: body.avatarId,
      nickname: body.nickname ?? null,
    })
    .select("id, pseudonym")
    .single();
  if (error) throw error;

  const pinHash = await hashPin(body.pin);
  const consents = [
    { learner_id: learner.id, consent_type: "account_storage", version: body.consent.version, language: body.consent.language },
    ...(body.consent.analytics
      ? [{ learner_id: learner.id, consent_type: "analytics", version: body.consent.version, language: body.consent.language }]
      : []),
  ];
  const results = await Promise.all([
    db.from("learner_credentials").insert({ learner_id: learner.id, pin_hash: pinHash }),
    db.from("device_profiles").insert({ id: body.deviceProfileId, learner_id: learner.id }),
    db.from("consent_records").insert(consents),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    await db.from("learners").delete().eq("id", learner.id);
    throw failed.error;
  }
  await recordEvents([{ event: "registration", props: { language: body.teachingLanguage } }], body.consent.analytics ? learner.pseudonym : null);
  return json({ learnerId: learner.id, alreadyRegistered: false }, { status: 201 });
});

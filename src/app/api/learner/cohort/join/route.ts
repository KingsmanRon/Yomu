import { z } from "zod";
import { CONSENT_VERSION } from "@/config/app";
import { handler, json, readJson } from "@/server/http";
import { HttpError, requireLearner, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    code: z.string().regex(/^[0-9]{6}$/),
    share: z.object({ mastery: z.boolean(), mistakes: z.boolean(), tutorLogs: z.boolean() }).strict(),
    consentVersion: z.string(),
    language: z.enum(["zu", "st"]),
  })
  .strict();

/** Join a class with the 6-digit code (typed or scanned), after spoken sharing consent. */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = Body.parse(await readJson(request));
  if (body.consentVersion !== CONSENT_VERSION) throw new HttpError(409, "consent_version_outdated");
  const { data, error } = await supabaseAdmin().rpc("join_cohort", {
    p_learner: learner.id,
    p_code: body.code,
    p_share: body.share,
    p_version: body.consentVersion,
    p_language: body.language,
  });
  if (error) throw error;
  if (data?.error === "not_found") throw new HttpError(404, "cohort_not_found");
  if (data?.error === "rate_limited") throw new HttpError(429, "too_many_attempts");
  return json({ cohortId: data.cohortId, name: data.name });
});

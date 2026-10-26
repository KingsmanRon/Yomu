import { z } from "zod";
import { CONSENT_VERSION } from "@/config/app";
import { handler, json, readJson } from "@/server/http";
import { HttpError, requireLearner, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    cohortId: z.uuid(),
    share: z
      .object({ progress: z.boolean(), mastery: z.boolean(), mistakes: z.boolean(), tutorLogs: z.boolean() })
      .strict(),
    consentVersion: z.string(),
    language: z.enum(["zu", "st"]),
  })
  .strict();

/**
 * Change or withdraw sharing with a class. Sharing nothing (progress false)
 * withdraws from the class; facilitators stop seeing the learner immediately.
 */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = Body.parse(await readJson(request));
  if (body.consentVersion !== CONSENT_VERSION) throw new HttpError(409, "consent_version_outdated");
  const { data, error } = await supabaseAdmin().rpc("update_cohort_sharing", {
    p_learner: learner.id,
    p_cohort: body.cohortId,
    p_share: body.share,
    p_version: body.consentVersion,
    p_language: body.language,
  });
  if (error) throw error;
  if (data === "not_member") throw new HttpError(404, "not_a_member");
  return json({ result: data });
});

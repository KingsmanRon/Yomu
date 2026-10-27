import { z } from "zod";
import { CONSENT_VERSION } from "@/config/app";
import { handler, json, readJson } from "@/server/http";
import { HttpError, requireLearner, supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    type: z.literal("analytics"),
    granted: z.boolean(),
    version: z.string(),
    language: z.enum(["zu", "st"]),
  })
  .strict();

/**
 * Change the answer to "may we count how you use the app, without your
 * name?" after registration (Me > Privacy). A "no" takes effect at once: the
 * analytics endpoint checks this consent on every request. Consent to online
 * storage is withdrawn with the deletion flow, and class sharing with
 * /api/learner/cohort/sharing.
 */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = Body.parse(await readJson(request));
  if (body.version !== CONSENT_VERSION) throw new HttpError(409, "consent_version_outdated");
  const db = supabaseAdmin();
  const { data: active, error } = await db
    .from("consent_records")
    .select("id")
    .eq("learner_id", learner.id)
    .eq("consent_type", "analytics")
    .is("withdrawn_at", null);
  if (error) throw error;
  if (body.granted && (active ?? []).length === 0) {
    const { error: e } = await db
      .from("consent_records")
      .insert({ learner_id: learner.id, consent_type: "analytics", version: body.version, language: body.language });
    if (e) throw e;
  }
  if (!body.granted && (active ?? []).length > 0) {
    const { error: e } = await db
      .from("consent_records")
      .update({ withdrawn_at: new Date().toISOString() })
      .in(
        "id",
        (active ?? []).map((c) => c.id),
      );
    if (e) throw e;
  }
  return json({ analytics: body.granted });
});

import { z } from "zod";
import { serverEnv } from "@/server/env";
import { handler, json, readJson } from "@/server/http";
import { ANALYTICS_EVENTS, recordEvents } from "@/server/observability";
import { supabaseAdmin, userFromRequest } from "@/server/supabase";

const Body = z
  .object({
    events: z
      .array(
        z
          .object({
            event: z.enum(ANALYTICS_EVENTS),
            props: z.record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
            at: z.string().max(40).optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

/**
 * Product analytics. Recorded only for a signed-in learner whose consent to
 * usage counts is in force (checked on every request, so a withdrawal takes
 * effect at once), under their random pseudonym. Anything else is dropped,
 * never stored anonymously: a learner who said no is not counted at all.
 * Disabled entirely with ANALYTICS_ENABLED=false.
 */
export const POST = handler(async (request) => {
  if (!serverEnv.analyticsEnabled) return json({ recorded: 0, disabled: true });
  const body = Body.parse(await readJson(request, 64_000));
  let pseudonym: string | null = null;
  if (request.headers.get("authorization")) {
    try {
      const { user } = await userFromRequest(request);
      const db = supabaseAdmin();
      const { data: learner } = await db.from("learners").select("id, pseudonym").eq("auth_user_id", user.id).maybeSingle();
      if (learner) {
        const { data: consent } = await db
          .from("consent_records")
          .select("id")
          .eq("learner_id", learner.id)
          .eq("consent_type", "analytics")
          .is("withdrawn_at", null)
          .limit(1);
        if (consent && consent.length > 0) pseudonym = learner.pseudonym;
      }
    } catch {
      // Not a valid learner session: nothing is recorded.
    }
  }
  if (!pseudonym) return json({ recorded: 0, reason: "no_consent" });
  await recordEvents(body.events, pseudonym);
  return json({ recorded: body.events.length });
});

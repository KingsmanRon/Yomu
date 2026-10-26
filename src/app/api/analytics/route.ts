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
 * Product analytics. Guests and learners who did not consent to analytics are
 * counted anonymously (no identifier at all); consenting learners are counted
 * under their random pseudonym. Disabled entirely with ANALYTICS_ENABLED=false.
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
      // Unauthenticated analytics are still accepted, anonymously.
    }
  }
  await recordEvents(body.events, pseudonym);
  return json({ recorded: body.events.length });
});

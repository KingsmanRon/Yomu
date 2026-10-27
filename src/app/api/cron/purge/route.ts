import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/server/env";
import { handler, json } from "@/server/http";
import { HttpError, supabaseAdmin } from "@/server/supabase";

/**
 * Retention: deletes expired tutor logs, rate-limit records, old analytics
 * and error logs, and learners whose account was left without a device.
 * Call daily from a scheduler with `Authorization: Bearer $CRON_SECRET`
 * (pg_cron runs the same function inside Supabase where it is available).
 */
function authorised(request: Request): boolean {
  const secret = serverEnv.cronSecret;
  const given = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (secret.length < 16 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

const run = handler(async (request) => {
  if (!serverEnv.cronSecret) throw new HttpError(503, "not_configured", "Set CRON_SECRET (at least 16 characters).");
  if (!authorised(request)) throw new HttpError(401, "unauthenticated");
  const { data, error } = await supabaseAdmin().rpc("purge_expired");
  if (error) throw error;
  return json({ ok: true, deleted: data });
});

export const GET = run;
export const POST = run;

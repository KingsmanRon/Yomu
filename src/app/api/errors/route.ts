import { z } from "zod";
import { backendReady } from "@/server/env";
import { handler, json, readJson } from "@/server/http";
import { scrub, scrubContext } from "@/server/observability";
import { supabaseAdmin } from "@/server/supabase";

const Body = z
  .object({
    errors: z
      .array(z.object({ message: z.string().max(2000), context: z.record(z.string(), z.unknown()).optional() }).strict())
      .max(20),
  })
  .strict();

/** Client error reports stored per minute across all callers; the rest are dropped. */
export const CLIENT_ERRORS_PER_MINUTE = 30;

/**
 * Client error reports: scrubbed, no personal data, no identifiers. Anyone
 * can call this (errors happen before registration too), so storage is
 * capped in the database for everyone together.
 */
export const POST = handler(async (request) => {
  const body = Body.parse(await readJson(request, 64_000));
  const rows = body.errors.map((e) => ({
    message: scrub(e.message),
    context: scrubContext(e.context ?? {}),
    build_id: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
  }));
  if (!backendReady()) {
    for (const r of rows) console.error("[yomu] client:", r.message, r.context);
    return json({ recorded: 0 });
  }
  const { data, error } = await supabaseAdmin().rpc("log_client_errors", { p_rows: rows, p_per_minute: CLIENT_ERRORS_PER_MINUTE });
  if (error) throw error;
  return json({ recorded: data as number });
});

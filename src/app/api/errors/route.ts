import { z } from "zod";
import { handler, json, readJson } from "@/server/http";
import { logServerError, scrub } from "@/server/observability";

const Body = z
  .object({
    errors: z
      .array(z.object({ message: z.string().max(2000), context: z.record(z.string(), z.unknown()).optional() }).strict())
      .max(20),
  })
  .strict();

/** Client error reports: scrubbed, no personal data, no identifiers. */
export const POST = handler(async (request) => {
  const body = Body.parse(await readJson(request, 64_000));
  for (const e of body.errors) await logServerError(new Error(scrub(e.message)), { ...(e.context ?? {}), kind: "client" });
  return json({ recorded: body.errors.length });
});

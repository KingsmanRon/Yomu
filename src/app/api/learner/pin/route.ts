import { z } from "zod";
import { checkLearnerPin, pinAttemptSucceeded } from "@/server/credentials";
import { handler, json, readJson } from "@/server/http";
import { hashPin, isValidPin } from "@/server/pin";
import { HttpError, requireLearner } from "@/server/supabase";

const Body = z
  .object({
    currentPin: z.string().refine(isValidPin),
    newPin: z.string().refine(isValidPin),
  })
  .strict();

/**
 * Change the picture PIN. The current PIN is checked on the server with the
 * attempt counted first, so parallel guesses wait like sequential ones
 * (never a lockout from learning: the app keeps working on the phone).
 */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = Body.parse(await readJson(request));
  const check = await checkLearnerPin(learner.id, body.currentPin);
  if (!check.ok) {
    if (check.reason === "wait") return json({ error: "pin_wait", retryAfter: check.retryAfter }, { status: 429 });
    if (check.reason === "wrong") throw new HttpError(403, "pin_wrong");
    throw new HttpError(409, "no_credentials");
  }
  if (!(await pinAttemptSucceeded(learner.id, check.verifiedHash, await hashPin(body.newPin)))) throw new HttpError(409, "pin_changed");
  return json({ ok: true });
});

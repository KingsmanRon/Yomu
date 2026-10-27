import { handler, json, readJson } from "@/server/http";
import { SyncRequestSchema } from "@/server/ops";
import { requireLearner } from "@/server/supabase";
import { syncLearner } from "@/server/sync";

/**
 * Offline sync. The learner is taken from the bearer token, never from the
 * payload, so ops from one profile on a shared phone can never be stored for
 * another.
 */
export const POST = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = SyncRequestSchema.parse(await readJson(request, 2_000_000));
  const result = await syncLearner(learner.id, body);
  return json(result);
});

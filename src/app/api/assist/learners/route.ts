import { facilitatorCohorts } from "@/server/assist";
import { handler, json } from "@/server/http";
import { requireStaff } from "@/server/supabase";

/** For facilitator-assisted mode: the facilitator's cohorts and their learners' pictures. */
export const GET = handler(async (request) => {
  const { user } = await requireStaff(request, ["facilitator"]);
  return json({ cohorts: await facilitatorCohorts(user.id) });
});

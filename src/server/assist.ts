import "server-only";
import { HttpError, requireStaff, supabaseAdmin } from "./supabase";

/**
 * Facilitator-assisted mode: a facilitator signs in on a learner's phone to
 * reset a forgotten picture PIN or to move the learner to a new phone. The
 * facilitator may only help learners who are active members of a cohort they
 * facilitate, every action is written to facilitator_assists (and included in
 * the learner's data export), and the PIN is chosen by the learner on the
 * learner's screen: it is never shown to or typed by the facilitator.
 */
export interface AssistLearner {
  learnerId: string;
  avatarId: string;
  nickname: string | null;
  language: "zu" | "st";
}

export interface AssistCohort {
  id: string;
  name: string;
  learners: AssistLearner[];
}

/**
 * Live classes the facilitator runs (holding the facilitator role in each
 * class's organisation), with each active learner's picture and nickname.
 */
export async function facilitatorCohorts(userId: string): Promise<AssistCohort[]> {
  const { data, error } = await supabaseAdmin().rpc("assist_learners", { p_facilitator: userId });
  if (error) throw error;
  const cohorts = new Map<string, AssistCohort>();
  for (const r of (data ?? []) as { cohort_id: string; cohort_name: string; learner_id: string; avatar_id: string; nickname: string | null; teaching_language: "zu" | "st" }[]) {
    const c = cohorts.get(r.cohort_id) ?? { id: r.cohort_id, name: r.cohort_name, learners: [] };
    c.learners.push({ learnerId: r.learner_id, avatarId: r.avatar_id, nickname: r.nickname, language: r.teaching_language });
    cohorts.set(r.cohort_id, c);
  }
  return [...cohorts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The facilitator from the bearer token, checked to facilitate a live cohort
 * in which the learner is an active member. Returns that cohort for the audit
 * record.
 */
export async function requireFacilitatorOf(request: Request, learnerId: string): Promise<{ userId: string; cohortId: string }> {
  const { user } = await requireStaff(request, ["facilitator"]);
  const cohorts = await facilitatorCohorts(user.id);
  const cohort = cohorts.find((c) => c.learners.some((l) => l.learnerId === learnerId));
  if (!cohort) throw new HttpError(403, "not_your_learner");
  return { userId: user.id, cohortId: cohort.id };
}

export async function recordAssist(learnerId: string, facilitatorUserId: string, cohortId: string, action: "pin_reset" | "device_transfer"): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("facilitator_assists")
    .insert({ learner_id: learnerId, facilitator_user_id: facilitatorUserId, cohort_id: cohortId, action });
  if (error) throw error;
}

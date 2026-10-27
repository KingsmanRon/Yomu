import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Facilitator-assisted mode: a facilitator signs in on a learner's phone to
 * reset a forgotten picture PIN or to move the learner to a new phone. The
 * facilitator may only help learners who are active members of a live class
 * they facilitate in its organisation. The resets and moves themselves are
 * authorised, applied and audited inside the database in one transaction
 * (assist_reset_pin, transfer_learner); every action is written to
 * facilitator_assists (and included in the learner's data export). The PIN is
 * chosen by the learner on the learner's screen: it is never shown to or
 * typed by the facilitator.
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

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

/** Cohorts the signed-in facilitator runs, with each active learner's picture and nickname. */
export async function facilitatorCohorts(userId: string): Promise<AssistCohort[]> {
  const db = supabaseAdmin();
  const { data: links, error } = await db.from("cohort_facilitators").select("cohort_id, cohorts(id, name, archived_at)").eq("user_id", userId);
  if (error) throw error;
  const cohorts = (links ?? [])
    .map((l) => l.cohorts as unknown as { id: string; name: string; archived_at: string | null } | null)
    .filter((c): c is { id: string; name: string; archived_at: string | null } => !!c && !c.archived_at);
  if (cohorts.length === 0) return [];
  const { data: members, error: mErr } = await db
    .from("cohort_memberships")
    .select("cohort_id, learners(id, avatar_id, nickname, teaching_language)")
    .in(
      "cohort_id",
      cohorts.map((c) => c.id),
    )
    .eq("status", "active");
  if (mErr) throw mErr;
  return cohorts
    .map((c) => ({
      id: c.id,
      name: c.name,
      learners: (members ?? [])
        .filter((m) => m.cohort_id === c.id)
        .map((m) => m.learners as unknown as { id: string; avatar_id: string; nickname: string | null; teaching_language: "zu" | "st" } | null)
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((l) => ({ learnerId: l.id, avatarId: l.avatar_id, nickname: l.nickname, language: l.teaching_language })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

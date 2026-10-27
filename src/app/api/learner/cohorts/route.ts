import { handler, json } from "@/server/http";
import { requireLearner, supabaseAdmin, supabaseAsUser } from "@/server/supabase";

/**
 * The learner's classes with the opt-in group encouragement message (only
 * when the facilitator enabled it, and only as an anonymous group total).
 */
export const GET = handler(async (request) => {
  const { learner, token } = await requireLearner(request);
  const { data, error } = await supabaseAdmin()
    .from("cohort_memberships")
    .select("cohort_id, status, share_progress, share_mastery, share_mistakes, share_tutor_logs, joined_at, cohorts(name, encouragement_enabled)")
    .eq("learner_id", learner.id)
    .eq("status", "active");
  if (error) throw error;
  const asUser = supabaseAsUser(token);
  const classes = await Promise.all(
    (data ?? []).map(async (m) => {
      const cohort = m.cohorts as unknown as { name: string; encouragement_enabled: boolean } | null;
      let encouragement: { lessonsThisWeek: number; learnersActive: number } | null = null;
      if (cohort?.encouragement_enabled) {
        const { data: e } = await asUser.rpc("cohort_encouragement", { p_cohort: m.cohort_id });
        const row = (e ?? [])[0] as { lessons_this_week: number; learners_active_this_week: number } | undefined;
        if (row && row.lessons_this_week > 0) encouragement = { lessonsThisWeek: row.lessons_this_week, learnersActive: row.learners_active_this_week };
      }
      return {
        cohortId: m.cohort_id,
        name: cohort?.name ?? "",
        joinedAt: m.joined_at,
        share: { progress: m.share_progress, mastery: m.share_mastery, mistakes: m.share_mistakes, tutorLogs: m.share_tutor_logs },
        encouragement,
      };
    }),
  );
  return json({ classes });
});

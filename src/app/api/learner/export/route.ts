import { handler } from "@/server/http";
import { requireLearner, supabaseAdmin } from "@/server/supabase";

/** Everything stored about the learner, as one JSON file (POPIA access request). */
export const GET = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const db = supabaseAdmin();
  const byLearner = (table: string, columns = "*") => db.from(table).select(columns).eq("learner_id", learner.id);
  const [consents, memberships, devices, ops, progress, mastery, achievements, streaks, revision, tutorLogs, assists, transfers] =
    await Promise.all([
      byLearner("consent_records"),
      db.from("cohort_memberships").select("*, cohorts(name)").eq("learner_id", learner.id),
      byLearner("device_profiles"),
      byLearner("sync_operations", "op_id, op_type, payload, client_at, local_date, received_at"),
      byLearner("learner_progress"),
      byLearner("objective_mastery"),
      byLearner("learner_achievements"),
      byLearner("streak_days"),
      byLearner("revision_schedule"),
      byLearner("tutor_logs", "created_at, tier, language, lesson_id, request_text, response_text, generated, expires_at"),
      byLearner("facilitator_assists", "action, created_at"),
      byLearner("device_transfers", "id, created_at, status, pin_reset, revoked_at"),
    ]);
  for (const r of [consents, memberships, devices, ops, progress, mastery, achievements, streaks, revision, tutorLogs, assists, transfers]) {
    if (r.error) throw r.error;
  }
  const body = {
    exportedAt: new Date().toISOString(),
    note: "All information stored about you online. No voice recordings are ever stored. Your PIN is stored only as a one-way hash and is not included.",
    learner: {
      id: learner.id,
      teachingLanguage: learner.teaching_language,
      avatarId: learner.avatar_id,
      nickname: learner.nickname,
      currentLevel: learner.current_level,
      createdAt: learner.created_at,
      pseudonym: learner.pseudonym,
    },
    consents: consents.data,
    classes: memberships.data,
    devices: devices.data,
    activity: ops.data,
    progress: progress.data,
    mastery: mastery.data,
    achievements: achievements.data,
    streakDays: streaks.data,
    revisionSchedule: revision.data,
    tutorLogs: tutorLogs.data,
    facilitatorHelp: assists.data,
    moves: transfers.data,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-learning-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

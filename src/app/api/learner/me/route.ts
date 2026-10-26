import { z } from "zod";
import { handler, json, readJson } from "@/server/http";
import { requireLearner, supabaseAdmin } from "@/server/supabase";

/** The signed-in learner's own record, class memberships and consents. */
export const GET = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const db = supabaseAdmin();
  const [memberships, consents] = await Promise.all([
    db
      .from("cohort_memberships")
      .select("cohort_id, status, share_progress, share_mastery, share_mistakes, share_tutor_logs, joined_at, cohorts(name)")
      .eq("learner_id", learner.id),
    db
      .from("consent_records")
      .select("consent_type, cohort_id, scope, version, language, granted_at, withdrawn_at")
      .eq("learner_id", learner.id)
      .order("granted_at"),
  ]);
  if (memberships.error) throw memberships.error;
  if (consents.error) throw consents.error;
  return json({
    learner: {
      id: learner.id,
      teachingLanguage: learner.teaching_language,
      avatarId: learner.avatar_id,
      nickname: learner.nickname,
      currentLevel: learner.current_level,
      createdAt: learner.created_at,
    },
    memberships: (memberships.data ?? []).map((m) => ({
      cohortId: m.cohort_id,
      cohortName: (m.cohorts as unknown as { name: string } | null)?.name ?? "",
      status: m.status,
      share: { progress: m.share_progress, mastery: m.share_mastery, mistakes: m.share_mistakes, tutorLogs: m.share_tutor_logs },
      joinedAt: m.joined_at,
    })),
    consents: consents.data,
  });
});

const Patch = z
  .object({
    avatarId: z.string().regex(/^avatar-[a-z]+$/).optional(),
    nickname: z.string().trim().max(40).nullable().optional(),
    teachingLanguage: z.enum(["zu", "st"]).optional(),
  })
  .strict();

export const PATCH = handler(async (request) => {
  const { learner } = await requireLearner(request);
  const body = Patch.parse(await readJson(request));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.avatarId) update.avatar_id = body.avatarId;
  if (body.nickname !== undefined) update.nickname = body.nickname || null;
  if (body.teachingLanguage) update.teaching_language = body.teachingLanguage;
  const { error } = await supabaseAdmin().from("learners").update(update).eq("id", learner.id);
  if (error) throw error;
  return json({ ok: true });
});

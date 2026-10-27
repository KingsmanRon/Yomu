import "server-only";
import { deriveState } from "@/lib/learning/engine";
import type { DerivedState, Op } from "@/lib/learning/types";
import { loadCatalog, todayInSouthAfrica } from "./catalog";
import type { SyncRequest } from "./ops";
import { HttpError, supabaseAdmin } from "./supabase";

/**
 * Server side of offline sync.
 *
 *  1. Store the device's ops idempotently (op ID = idempotency key). Ops are
 *     merged, never lost; an op ID that belongs to another learner is refused.
 *  2. Re-derive all progress from the learner's complete log with the same
 *     engine the phone uses, and write the derived tables. XP is recalculated,
 *     never summed.
 *  3. Return ops the device does not have yet (from the learner's other
 *     devices), so every device converges on the same log.
 */
export interface SyncResult {
  accepted: string[];
  rejected: string[];
  cursor: number;
  ops: Op[];
  summary: { xp: number; lessonsCompleted: number; objectivesMastered: number; currentStreak: number };
}

const PAGE = 1000;

export async function loadLearnerOps(learnerId: string): Promise<{ ops: Op[]; maxSeq: number; rows: { seq: number; op: Op }[] }> {
  const db = supabaseAdmin();
  const rows: { seq: number; op: Op }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("sync_operations")
      .select("op_id, seq, op_type, payload, client_at, local_date, device_profile_id")
      .eq("learner_id", learnerId)
      .order("seq", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      rows.push({
        seq: Number(r.seq),
        op: {
          id: r.op_id,
          profileId: r.device_profile_id ?? "",
          type: r.op_type,
          at: new Date(r.client_at).toISOString(),
          localDate: r.local_date,
          data: r.payload,
        } as Op,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return { ops: rows.map((r) => r.op), maxSeq: rows.reduce((m, r) => Math.max(m, r.seq), 0), rows };
}

export function derivedForStorage(state: DerivedState) {
  const objectivesMastered = Object.values(state.objectives).filter((o) => o.firstMasteredAt).length;
  const streakDays = [
    ...state.streak.activeDates.map((d) => ({ local_date: d, kind: "active" })),
    ...state.streak.graceDates.map((d) => ({ local_date: d, kind: "grace" })),
  ];
  return {
    progress: {
      xp: state.xp,
      xpBreakdown: state.xpBreakdown,
      lessonsCompleted: Object.values(state.lessons).filter((l) => l.completions > 0).length,
      objectivesMastered,
      currentStreak: state.streak.current,
      longestStreak: state.streak.longest,
      graceRemaining: state.streak.graceRemaining,
      currentLevel: state.level.current,
      lastActiveDate: state.lastActiveDate ?? null,
    },
    objectives: Object.entries(state.objectives).map(([id, o]) => ({
      objective_id: id,
      status: o.status,
      first_mastered_at: o.firstMasteredAt ?? null,
      competencies: o.competencies,
    })),
    badges: Object.entries(state.badges).map(([id, b]) => ({ badge_id: id, earned_at: b.earnedAt })),
    streakDays,
    revision: Object.values(state.revision).map((c) => ({
      exercise_id: c.exerciseId,
      lesson_id: c.lessonId,
      item_id: c.itemId,
      objective_ids: c.objectiveIds,
      box: c.box,
      due_date: c.dueDate,
      last_outcome: c.lastOutcome,
      lapses: c.lapses,
      last_failed_decode_date: c.lastFailedDecodeDate ?? null,
    })),
  };
}

/** Recompute and store derived progress from the learner's full log. */
export async function recomputeLearner(learnerId: string): Promise<DerivedState> {
  const { ops } = await loadLearnerOps(learnerId);
  const state = deriveState(ops, loadCatalog().meta, todayInSouthAfrica());
  const { error } = await supabaseAdmin().rpc("sync_write_derived", {
    p_learner: learnerId,
    p_watermark: ops.length,
    p_state: derivedForStorage(state),
  });
  if (error) throw error;
  return state;
}

export async function syncLearner(learnerId: string, request: SyncRequest): Promise<SyncResult> {
  const db = supabaseAdmin();

  // The device profile must belong to this learner (or be new to it).
  const { data: device } = await db.from("device_profiles").select("learner_id").eq("id", request.deviceProfileId).maybeSingle();
  if (device && device.learner_id !== learnerId) throw new HttpError(403, "device_profile_mismatch");
  if (!device) {
    const { error } = await db.from("device_profiles").insert({ id: request.deviceProfileId, learner_id: learnerId });
    if (error) throw error;
  }

  let accepted: string[] = [];
  let rejected: string[] = [];
  if (request.ops.length > 0) {
    const { data, error } = await db.rpc("sync_ingest", {
      p_learner: learnerId,
      p_device: request.deviceProfileId,
      p_ops: request.ops,
    });
    if (error) throw error;
    accepted = (data?.accepted ?? []) as string[];
    rejected = (data?.rejected ?? []) as string[];
  }

  const { ops, maxSeq, rows } = await loadLearnerOps(learnerId);
  const state = deriveState(ops, loadCatalog().meta, todayInSouthAfrica());
  const { error: writeError } = await db.rpc("sync_write_derived", {
    p_learner: learnerId,
    p_watermark: ops.length,
    p_state: derivedForStorage(state),
  });
  if (writeError) throw writeError;

  const sent = new Set(request.ops.map((o) => o.id));
  const newer = rows.filter((r) => r.seq > request.cursor && !sent.has(r.op.id)).map((r) => r.op);
  return {
    accepted,
    rejected,
    cursor: maxSeq,
    ops: newer,
    summary: {
      xp: state.xp,
      lessonsCompleted: Object.values(state.lessons).filter((l) => l.completions > 0).length,
      objectivesMastered: Object.values(state.objectives).filter((o) => o.firstMasteredAt).length,
      currentStreak: state.streak.current,
    },
  };
}

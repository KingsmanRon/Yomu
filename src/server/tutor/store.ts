import "server-only";
import { serverEnv } from "../env";
import { supabaseAdmin } from "../supabase";
import type { TutorStore } from "./ask";

/** The tutor's records in Postgres: rate limits, the spending cap and expiring text logs. */
export function supabaseTutorStore(): TutorStore {
  const db = supabaseAdmin();
  return {
    async rateCheck(learnerId, tier) {
      const { data, error } = await db.rpc("tutor_rate_check", {
        p_learner: learnerId,
        p_tier: tier,
        p_per_minute: serverEnv.ai.perMinute,
        p_per_day: serverEnv.ai.perDay,
      });
      if (error) throw error;
      return data === true;
    },
    async reserveSpend(day, estimateUsd) {
      const { data, error } = await db.rpc("ai_reserve_spend", { p_day: day, p_estimate: estimateUsd, p_cap: serverEnv.ai.dailyCapUsd });
      if (error) throw error;
      return data === true;
    },
    async settleSpend(day, deltaUsd) {
      if (deltaUsd === 0) return;
      const { error } = await db.rpc("ai_settle_spend", { p_day: day, p_delta: deltaUsd });
      if (error) throw error;
    },
    async logExchange(row) {
      const { error } = await db.from("tutor_logs").insert(row);
      if (error) throw error;
    },
    async logUnanswered(row) {
      const { error } = await db.from("tutor_unanswered_intents").insert(row);
      if (error) throw error;
    },
  };
}

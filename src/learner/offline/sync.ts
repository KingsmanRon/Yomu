import type { Op } from "@/lib/learning/types";
import type { StoredProfile, YomuDB } from "./db";
import { markSynced, mergeServerOps, unsyncedOps } from "./oplog";
import { updateProfile } from "./profiles";

export type SyncOutcome =
  | { status: "guest" }
  | { status: "no_session" }
  | { status: "offline" }
  | { status: "error"; code: string }
  | { status: "ok"; sent: number; received: number; rejected: number };

interface SyncResponse {
  accepted: string[];
  rejected: string[];
  cursor: number;
  ops: Op[];
}

export interface SyncDeps {
  token: () => Promise<string | null>;
  fetch?: typeof fetch;
  batchSize?: number;
}

/**
 * Upload this profile's unsynced ops in batches and merge ops made on the
 * learner's other devices. Only the given profile's ops are read, and they
 * are sent with that profile's own session. Safe to repeat: every op carries
 * an idempotency key, so a batch interrupted by a lost connection is simply
 * sent again.
 */
export async function syncProfile(db: YomuDB, profile: StoredProfile, deps: SyncDeps): Promise<SyncOutcome> {
  if (!profile.learnerId) return { status: "guest" };
  const token = await deps.token();
  if (!token) return { status: "no_session" };
  const doFetch = deps.fetch ?? fetch;
  const batchSize = deps.batchSize ?? 200;
  let cursor = profile.syncCursor;
  let sent = 0;
  let received = 0;
  let rejected = 0;

  for (let round = 0; round < 50; round++) {
    const batch = await unsyncedOps(db, profile.id, batchSize);
    let res: Response;
    try {
      res = await doFetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceProfileId: profile.id, cursor, ops: batch }),
      });
    } catch {
      return { status: "offline" };
    }
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        code = ((await res.json()) as { error?: string }).error ?? code;
      } catch {
        // Not JSON.
      }
      return { status: "error", code };
    }
    const body = (await res.json()) as SyncResponse;
    // Rejected op IDs belong to another learner (practically impossible with
    // random UUIDs). They are not retried forever; the outcome reports them.
    await markSynced(db, profile.id, [...body.accepted, ...body.rejected]);
    received += await mergeServerOps(db, profile.id, body.ops);
    sent += body.accepted.length;
    rejected += body.rejected.length;
    cursor = body.cursor;
    await updateProfile(db, profile.id, { syncCursor: cursor, lastSyncAt: new Date().toISOString() });
    if (batch.length < batchSize) break;
  }
  return { status: "ok", sent, received, rejected };
}

import { localDateOf } from "@/lib/learning/dates";
import type { Op, OpData, OpType } from "@/lib/learning/types";
import type { StoredOp, YomuDB } from "./db";

/** Create an op with a fresh idempotency key, the client time and the device's local date. */
export function newOp<T extends OpType>(type: T, data: OpData<T>, profileId: string, now: Date = new Date()): Op {
  return {
    id: crypto.randomUUID(),
    profileId,
    type,
    at: now.toISOString(),
    localDate: localDateOf(now),
    data,
  } as Op;
}

/** Append-only: ops are never edited, only added (and removed when a profile is deleted). */
export async function appendOp(db: YomuDB, op: Op): Promise<void> {
  await db.put("ops", { ...op, synced: 0 } as StoredOp);
}

function strip(op: StoredOp): Op {
  const { synced: _synced, ...rest } = op;
  void _synced;
  return rest as Op;
}

export async function opsForProfile(db: YomuDB, profileId: string): Promise<Op[]> {
  return (await db.getAllFromIndex("ops", "byProfile", profileId)).map(strip);
}

export async function unsyncedOps(db: YomuDB, profileId: string, limit = 500): Promise<Op[]> {
  return (await db.getAllFromIndex("ops", "byProfileSynced", [profileId, 0], limit)).map(strip);
}

export async function markSynced(db: YomuDB, profileId: string, ids: string[]): Promise<void> {
  const tx = db.transaction("ops", "readwrite");
  for (const id of ids) {
    const op = await tx.store.get(id);
    // Only ever touch this profile's ops.
    if (op && op.profileId === profileId) await tx.store.put({ ...op, synced: 1 });
  }
  await tx.done;
}

/**
 * Add ops that came from the server (made on this learner's other devices).
 * They are stored under this profile; existing IDs are left untouched.
 */
export async function mergeServerOps(db: YomuDB, profileId: string, ops: Op[]): Promise<number> {
  const tx = db.transaction("ops", "readwrite");
  let added = 0;
  for (const op of ops) {
    const existing = await tx.store.get(op.id);
    if (existing) continue;
    await tx.store.put({ ...op, profileId, synced: 1 } as StoredOp);
    added += 1;
  }
  await tx.done;
  return added;
}

export async function deleteProfileOps(db: YomuDB, profileId: string): Promise<void> {
  const tx = db.transaction("ops", "readwrite");
  for (const key of await tx.store.index("byProfile").getAllKeys(profileId)) await tx.store.delete(key);
  await tx.done;
}

export async function markAllUnsynced(db: YomuDB, profileId: string): Promise<void> {
  const tx = db.transaction("ops", "readwrite");
  for (const op of await tx.store.index("byProfile").getAll(profileId)) await tx.store.put({ ...op, synced: 0 });
  await tx.done;
}

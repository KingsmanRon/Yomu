import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { TeachingLanguage } from "@/config/app";
import type { Op } from "@/lib/learning/types";

/**
 * On-device storage (IndexedDB). Several learners can share one phone: every
 * profile's ops are stored with its profile ID and every query filters by it.
 * Nothing here is sent anywhere until the learner gives spoken consent and
 * registers; after that only that profile's own ops are synced, with that
 * profile's own session.
 */
export interface ProfileSettings {
  /** Text size multiplier for older learners' eyesight. */
  textScale: 1 | 1.15 | 1.3;
  /** Show the words under spoken lines (in the teaching language). */
  captions: boolean;
  /** Only download lesson packs on Wi-Fi. */
  wifiOnly: boolean;
  /** Microphone choice after the spoken explanation. */
  mic: "unknown" | "allowed" | "declined";
}

export interface LocalPin {
  salt: string;
  hash: string;
  iterations: number;
}

export interface StoredProfile {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  avatarId: string;
  nickname?: string;
  language: TeachingLanguage;
  pin: LocalPin | null;
  /** Server learner ID once registered (after spoken consent). Guests have none. */
  learnerId?: string;
  registeredAt?: string;
  analyticsConsent?: boolean;
  /** Set when the learner first asked to delete the online account (see Privacy). */
  deletionRequestedAt?: string;
  settings: ProfileSettings;
  onboarding: { completed: boolean; placementDone: boolean };
  pinFailures: number;
  pinRetryAfter?: string;
  syncCursor: number;
  lastSyncAt?: string;
  /**
   * The server no longer accepts this phone's session for the learner: a
   * facilitator moved the learner to another phone (or the account was
   * deleted elsewhere). Learning here stays on this phone; the learner can
   * remove the profile from this phone. Cleared by any successful sync.
   */
  sessionLost?: boolean;
}

export type StoredOp = Op & { synced: 0 | 1 };

export interface QueuedEvent {
  id?: number;
  profileId: string | null;
  event: string;
  props: Record<string, string | number | boolean>;
  at: string;
}

interface YomuSchema extends DBSchema {
  profiles: { key: string; value: StoredProfile };
  ops: {
    key: string;
    value: StoredOp;
    indexes: { byProfile: string; byProfileSynced: [string, number] };
  };
  meta: { key: string; value: unknown };
  analytics: { key: number; value: QueuedEvent };
}

export type YomuDB = IDBPDatabase<YomuSchema>;

export const DEFAULT_SETTINGS: ProfileSettings = { textScale: 1, captions: true, wifiOnly: false, mic: "unknown" };

export function openYomuDB(name = "yomu"): Promise<YomuDB> {
  return openDB<YomuSchema>(name, 1, {
    upgrade(db) {
      db.createObjectStore("profiles", { keyPath: "id" });
      const ops = db.createObjectStore("ops", { keyPath: "id" });
      ops.createIndex("byProfile", "profileId");
      ops.createIndex("byProfileSynced", ["profileId", "synced"]);
      db.createObjectStore("meta");
      db.createObjectStore("analytics", { keyPath: "id", autoIncrement: true });
    },
  });
}

export async function getMeta<T>(db: YomuDB, key: string): Promise<T | undefined> {
  return (await db.get("meta", key)) as T | undefined;
}

export async function setMeta(db: YomuDB, key: string, value: unknown): Promise<void> {
  await db.put("meta", value, key);
}

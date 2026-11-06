import type { TeachingLanguage } from "@/config/app";
import { DEFAULT_SETTINGS, type LocalPin, type StoredProfile, type YomuDB } from "./db";

/**
 * Picture PIN keys. Each key shows a picture and its number, so the PIN works
 * for learners who remember pictures and for those who prefer numbers.
 */
export const PIN_KEYS = [
  { digit: "1", image: "pin-tree" },
  { digit: "2", image: "pin-house" },
  { digit: "3", image: "pin-car" },
  { digit: "4", image: "pin-cup" },
  { digit: "5", image: "pin-flower" },
  { digit: "6", image: "pin-hat" },
  { digit: "7", image: "pin-key" },
  { digit: "8", image: "pin-ball" },
  { digit: "9", image: "pin-leaf" },
] as const;

export const AVATARS = [
  "avatar-protea",
  "avatar-aloe",
  "avatar-baobab",
  "avatar-sun",
  "avatar-moon",
  "avatar-star",
  "avatar-bird",
  "avatar-cow",
  "avatar-fish",
  "avatar-drum",
  "avatar-pot",
  "avatar-mountain",
] as const;

const PBKDF2_ITERATIONS = 150_000;

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Local PIN hash (PBKDF2-SHA256). It keeps household members out of each
 * other's profiles on a shared phone; it is not a defence against someone
 * with technical access to the device. The server keeps its own scrypt hash
 * for anything that crosses the network.
 */
export async function hashLocalPin(pin: string, saltB64?: string, iterations = PBKDF2_ITERATIONS): Promise<LocalPin> {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return { salt: toB64(salt), hash: toB64(bits), iterations };
}

export async function verifyLocalPin(profile: StoredProfile, pin: string): Promise<boolean> {
  if (!profile.pin) return true;
  const candidate = await hashLocalPin(pin, profile.pin.salt, profile.pin.iterations);
  // Constant-time-ish comparison of equal-length strings.
  let diff = candidate.hash.length ^ profile.pin.hash.length;
  for (let i = 0; i < candidate.hash.length; i++) diff |= candidate.hash.charCodeAt(i) ^ (profile.pin.hash.charCodeAt(i) || 0);
  return diff === 0;
}

/** Seconds to wait after repeated wrong PINs on this phone: a pause, never a lockout. */
export function localPinWaitSeconds(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(300, 30 * 2 ** (failures - 5));
}

export async function createProfile(
  db: YomuDB,
  input: { avatarId: string; language: TeachingLanguage; pin: string | null; nickname?: string },
  now: Date = new Date(),
): Promise<StoredProfile> {
  const profile: StoredProfile = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    avatarId: input.avatarId,
    nickname: input.nickname,
    language: input.language,
    pin: input.pin ? await hashLocalPin(input.pin) : null,
    settings: { ...DEFAULT_SETTINGS },
    onboarding: { completed: false, placementDone: false },
    pinFailures: 0,
    syncCursor: 0,
  };
  await db.put("profiles", profile);
  return profile;
}

/**
 * A registered learner moved to this phone with a facilitator's help. The
 * profile starts with an empty local log; the first sync downloads the
 * learner's whole history (sync cursor 0).
 */
export async function restoreProfile(
  db: YomuDB,
  input: { id: string; learnerId: string; avatarId: string; language: TeachingLanguage; nickname?: string; pin: string; analyticsConsent: boolean },
  now: Date = new Date(),
): Promise<StoredProfile> {
  const profile: StoredProfile = {
    id: input.id,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    avatarId: input.avatarId,
    nickname: input.nickname,
    language: input.language,
    pin: await hashLocalPin(input.pin),
    learnerId: input.learnerId,
    registeredAt: now.toISOString(),
    analyticsConsent: input.analyticsConsent,
    settings: { ...DEFAULT_SETTINGS },
    onboarding: { completed: true, placementDone: true },
    pinFailures: 0,
    syncCursor: 0,
  };
  await db.put("profiles", profile);
  return profile;
}

export async function listProfiles(db: YomuDB): Promise<StoredProfile[]> {
  return (await db.getAll("profiles")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getProfile(db: YomuDB, id: string): Promise<StoredProfile | undefined> {
  return db.get("profiles", id);
}

export async function updateProfile(db: YomuDB, id: string, patch: Partial<StoredProfile>): Promise<StoredProfile> {
  const tx = db.transaction("profiles", "readwrite");
  const current = await tx.store.get(id);
  if (!current) throw new Error(`profile ${id} not found`);
  const next = { ...current, ...patch, id: current.id };
  await tx.store.put(next);
  await tx.done;
  return next;
}

/**
 * Remove a profile and everything this phone holds for it, in one local
 * transaction: the profile, its activity log and its queued usage events
 * (which are then never sent); then its saved sign-in.
 */
export async function deleteProfile(db: YomuDB, id: string): Promise<void> {
  const tx = db.transaction(["profiles", "ops", "analytics"], "readwrite");
  const ops = tx.objectStore("ops");
  for (const key of await ops.index("byProfile").getAllKeys(id)) await ops.delete(key);
  const queued = tx.objectStore("analytics");
  for (const e of await queued.getAll()) if (e.profileId === id && e.id !== undefined) await queued.delete(e.id);
  await tx.objectStore("profiles").delete(id);
  await tx.done;
  try {
    localStorage.removeItem(`yomu-auth-${id}`);
  } catch {
    // Storage may be unavailable (private mode); nothing else to remove.
  }
}

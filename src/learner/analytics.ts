import { CLIENT_ANALYTICS_ENABLED } from "@/config/app";
import type { QueuedEvent, StoredProfile, YomuDB } from "./offline/db";
import { accessToken } from "./offline/auth";

/**
 * Pseudonymous product analytics, queued on the device and sent only for
 * learners who said yes to the spoken question "may we count how you use the
 * app, without your name?" (asked when they save their learning online, and
 * changeable in Me > Privacy). Events of guests and of learners who said no
 * never leave the phone: they are deleted from the queue. Props are limited to
 * short strings, numbers and booleans; never names, answers typed by the
 * learner, or audio. Switched off with NEXT_PUBLIC_ANALYTICS_ENABLED=false
 * (and on the server with ANALYTICS_ENABLED).
 */
export type TrackedEvent =
  | "onboarding_step"
  | "onboarding_complete"
  | "assessment_complete"
  | "lesson_start"
  | "lesson_complete"
  | "lesson_exit"
  | "revision_complete"
  | "sync_failure"
  | "provider_failure"
  | "tutor_help"
  | "pack_download"
  | "registration"
  | "cohort_join";

/** Events still waiting for a decision (onboarding before registration, guests) are kept this long. */
const UNDECIDED_MS = 24 * 3600_000;
/** No event older than this is ever sent. */
const MAX_AGE_MS = 7 * 24 * 3600_000;

let dbRef: YomuDB | null = null;
let flushing = false;

export function initAnalytics(db: YomuDB): void {
  dbRef = db;
}

export async function track(
  event: TrackedEvent,
  props: Record<string, string | number | boolean> = {},
  profileId: string | null = null,
): Promise<void> {
  if (!CLIENT_ANALYTICS_ENABLED || !dbRef) return;
  try {
    await dbRef.add("analytics", { profileId, event, props, at: new Date().toISOString() });
  } catch {
    // Analytics must never interfere with learning.
  }
}

/**
 * Attribute the onboarding screens seen before a profile existed to the
 * profile just created, so they are sent if (and only if) this learner says
 * yes to usage counts.
 */
export async function claimOnboardingEvents(db: YomuDB, profileId: string, now = Date.now()): Promise<void> {
  try {
    const tx = db.transaction("analytics", "readwrite");
    for (const e of await tx.store.getAll()) {
      if (e.profileId === null && now - Date.parse(e.at) < UNDECIDED_MS) await tx.store.put({ ...e, profileId });
    }
    await tx.done;
  } catch {
    // Analytics must never interfere with learning.
  }
}

/** What happens to a queued event, given the profiles on this phone. */
export function analyticsDecision(
  e: Pick<QueuedEvent, "profileId" | "at">,
  profiles: Pick<StoredProfile, "id" | "learnerId" | "analyticsConsent">[],
  now = Date.now(),
): "send" | "keep" | "delete" {
  const age = now - Date.parse(e.at);
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return "delete";
  const p = e.profileId ? profiles.find((x) => x.id === e.profileId) : undefined;
  if (p?.learnerId && p.analyticsConsent) return "send";
  // Registered and said no, or the profile was removed: never sent.
  if (p?.learnerId || (e.profileId && !p)) return "delete";
  // Not decided yet (onboarding, or a guest who may still save online).
  return age > UNDECIDED_MS ? "delete" : "keep";
}

/**
 * Delete what may not be sent, then send the rest with the learner's own
 * session (the server attaches their random pseudonym and checks their
 * consent again). Deleting works offline; sending waits for a connection.
 */
export async function flushAnalytics(profiles: Pick<StoredProfile, "id" | "learnerId" | "analyticsConsent">[]): Promise<void> {
  if (!dbRef || flushing) return;
  flushing = true;
  try {
    const queued = await dbRef.getAll("analytics");
    const groups = new Map<string, QueuedEvent[]>();
    const drop: number[] = [];
    for (const e of queued) {
      const d = CLIENT_ANALYTICS_ENABLED ? analyticsDecision(e, profiles) : "delete";
      if (d === "delete" && e.id !== undefined) drop.push(e.id);
      if (d === "send" && e.profileId) groups.set(e.profileId, [...(groups.get(e.profileId) ?? []), e]);
    }
    if (drop.length > 0) {
      const tx = dbRef.transaction("analytics", "readwrite");
      for (const id of drop) await tx.store.delete(id);
      await tx.done;
    }
    if (!navigator.onLine) return;
    for (const [profileId, events] of groups) {
      const token = await accessToken(profileId);
      if (!token) continue;
      for (let i = 0; i < events.length; i += 50) {
        const chunk = events.slice(i, i + 50);
        const res = await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ events: chunk.map((e) => ({ event: e.event, props: e.props, at: e.at })) }),
        });
        if (!res.ok && res.status !== 400) return;
        const tx = dbRef.transaction("analytics", "readwrite");
        for (const e of chunk) if (e.id !== undefined) await tx.store.delete(e.id);
        await tx.done;
      }
    }
  } catch {
    // Retry on the next flush.
  } finally {
    flushing = false;
  }
}

/** Forget every queued event of one profile (it said no to usage counts, or was removed). */
export async function forgetAnalytics(db: YomuDB, profileId: string): Promise<void> {
  try {
    const tx = db.transaction("analytics", "readwrite");
    for (const e of await tx.store.getAll()) if (e.profileId === profileId && e.id !== undefined) await tx.store.delete(e.id);
    await tx.done;
  } catch {
    // Deleted at the next flush instead.
  }
}

/** Report an unexpected client error without personal data. */
export function reportError(message: string, context: Record<string, string | number | boolean> = {}): void {
  try {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: [{ message: message.slice(0, 500), context }] }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore.
  }
}

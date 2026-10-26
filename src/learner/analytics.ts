import { CLIENT_ANALYTICS_ENABLED } from "@/config/app";
import type { YomuDB } from "./offline/db";
import { accessToken } from "./offline/auth";

/**
 * Pseudonymous product analytics, queued on the device and sent when online.
 * Props are limited to short strings, numbers and booleans; never names,
 * answers typed by the learner, or audio. Switched off with
 * NEXT_PUBLIC_ANALYTICS_ENABLED=false (and on the server with ANALYTICS_ENABLED).
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
 * Send queued events. Events of a registered learner who consented to
 * analytics are sent with their session (the server attaches their random
 * pseudonym); all others are sent without any identifier.
 */
export async function flushAnalytics(consentingProfiles: Set<string>): Promise<void> {
  if (!CLIENT_ANALYTICS_ENABLED || !dbRef || flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const queued = await dbRef.getAll("analytics", undefined, 200);
    const groups = new Map<string | null, typeof queued>();
    for (const e of queued) {
      const key = e.profileId && consentingProfiles.has(e.profileId) ? e.profileId : null;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    for (const [profileId, events] of groups) {
      const token = profileId ? await accessToken(profileId) : null;
      for (let i = 0; i < events.length; i += 50) {
        const chunk = events.slice(i, i + 50);
        const res = await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

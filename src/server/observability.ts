import "server-only";
import { serverEnv } from "./env";
import { supabaseAdmin } from "./supabase";

/**
 * Privacy-preserving error logging and product analytics.
 *
 * Only pseudonymous identifiers are stored. Messages are scrubbed of anything
 * that looks like a phone number, email address, token or long digit string
 * before storage, and contexts are limited to a small allow-list of keys.
 */
const ALLOWED_CONTEXT_KEYS = new Set([
  "path",
  "screen",
  "lessonId",
  "exerciseId",
  "provider",
  "status",
  "code",
  "online",
  "build",
  "kind",
]);

export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\b(sk|sb)_[\w-]{10,}/g, "[key]")
    .slice(0, 500);
}

export function scrubContext(context: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = scrub(v).slice(0, 120);
  }
  return out;
}

/** A readable message for thrown values, including Supabase's plain error objects. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown; details?: unknown };
    if (typeof e.message === "string") {
      return `${typeof e.code === "string" ? `${e.code}: ` : ""}${e.message}${typeof e.details === "string" && e.details ? ` (${e.details})` : ""}`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // Fall through to String().
    }
  }
  return String(error);
}

export async function logServerError(error: unknown, context: Record<string, unknown> = {}, pseudonym?: string) {
  const message = scrub(describeError(error));
  console.error("[yomu]", message, context);
  try {
    if (!serverEnv.supabaseUrl || !serverEnv.supabaseSecretKey) return;
    const { error: insertError } = await supabaseAdmin()
      .from("error_logs")
      .insert({ message, context: scrubContext(context), pseudonym: pseudonym ?? null, build_id: process.env.NEXT_PUBLIC_BUILD_ID ?? null });
    if (insertError) console.error("[yomu] could not store error log:", describeError(insertError));
  } catch {
    // Logging must never break a request.
  }
}

export const ANALYTICS_EVENTS = [
  "onboarding_step",
  "onboarding_complete",
  "assessment_complete",
  "lesson_start",
  "lesson_complete",
  "lesson_exit",
  "revision_complete",
  "sync_failure",
  "provider_failure",
  "tutor_help",
  "pack_download",
  "registration",
  "cohort_join",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export async function recordEvents(
  events: { event: AnalyticsEvent; props?: Record<string, unknown>; at?: string }[],
  pseudonym: string | null,
) {
  if (!serverEnv.analyticsEnabled || events.length === 0) return;
  const rows = events.map((e) => ({
    event: e.event,
    pseudonym,
    props: Object.fromEntries(
      Object.entries(e.props ?? {})
        .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 80))
        .slice(0, 12),
    ),
    client_at: e.at ?? null,
  }));
  const { error } = await supabaseAdmin().from("analytics_events").insert(rows);
  // Analytics must never break a request; a failure is only logged.
  if (error) console.error("[yomu] could not store analytics:", describeError(error));
}

import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { serverEnv } from "./env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses row-level security, so it is only used after
 * the caller has been authenticated and authorised in the route handler.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    if (!serverEnv.supabaseUrl || !serverEnv.supabaseSecretKey) {
      throw new HttpError(503, "backend_not_configured", "Supabase is not configured on this server.");
    }
    admin = createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}

/**
 * Client acting as the signed-in user, so row-level security applies. Used
 * for staff reads (facilitator functions check the caller's role).
 */
export function supabaseAsUser(accessToken: string): SupabaseClient {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new HttpError(401, "unauthenticated");
  return match[1];
}

export async function userFromRequest(request: Request): Promise<{ user: User; token: string }> {
  const token = bearerToken(request);
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthenticated");
  return { user: data.user, token };
}

export interface LearnerRow {
  id: string;
  auth_user_id: string;
  teaching_language: "zu" | "st";
  avatar_id: string;
  nickname: string | null;
  current_level: number;
  pseudonym: string;
  created_at: string;
  last_active_date: string | null;
}

/** The learner linked to the bearer token's user, or 403 when there is none. */
export async function requireLearner(request: Request): Promise<{ user: User; learner: LearnerRow; token: string }> {
  const { user, token } = await userFromRequest(request);
  const { data, error } = await supabaseAdmin()
    .from("learners")
    .select("id, auth_user_id, teaching_language, avatar_id, nickname, current_level, pseudonym, created_at, last_active_date")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, "not_registered");
  return { user, learner: data as LearnerRow, token };
}

export type StaffRole = "facilitator" | "org_admin" | "content_reviewer" | "platform_admin";

export async function requireStaff(
  request: Request,
  roles: StaffRole[],
): Promise<{ user: User; token: string; roles: { role: StaffRole; organisation_id: string | null }[] }> {
  const { user, token } = await userFromRequest(request);
  const { data, error } = await supabaseAdmin().from("staff_roles").select("role, organisation_id").eq("user_id", user.id);
  if (error) throw error;
  const mine = (data ?? []) as { role: StaffRole; organisation_id: string | null }[];
  if (!mine.some((r) => roles.includes(r.role))) throw new HttpError(403, "forbidden");
  return { user, token, roles: mine };
}

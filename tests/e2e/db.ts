import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { totp } from "../totp";

/** Server-side checks for end-to-end tests (local Supabase only). Null when not configured. */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export function adminDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key || !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface StaffAccount {
  userId: string;
  email: string;
  password: string;
  /** Key of the account's authenticator app, when it has set one up. */
  totpSecret: string | null;
  remove: () => Promise<void>;
}

/**
 * A fresh staff account, as an administrator creates it (each test gets its
 * own, so set-up and recovery start from a known state). With `enrolled`, it
 * has already set up its authenticator app.
 */
export async function newStaffAccount(
  db: SupabaseClient,
  role: "facilitator" | "org_admin" | "content_reviewer" | "platform_admin",
  organisationId: string | null,
  { enrolled = false }: { enrolled?: boolean } = {},
): Promise<StaffAccount> {
  const email = `e2e-${role}-${crypto.randomUUID().slice(0, 8)}@e2e.yomu.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  const userId = data.user.id;
  const remove = async () => void (await db.auth.admin.deleteUser(userId));
  const { error: roleErr } = await db.from("staff_roles").insert({ user_id: userId, role, organisation_id: organisationId, display_name: `E2E ${role}` });
  if (roleErr) throw roleErr;
  if (!enrolled) return { userId, email, password, totpSecret: null, remove };
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  const enrol = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrol.error || !enrol.data) throw enrol.error ?? new Error("no factor");
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: totp(enrol.data.totp.secret) });
  if (verified.error) throw verified.error;
  await client.auth.signOut({ scope: "local" });
  return { userId, email, password, totpSecret: enrol.data.totp.secret, remove };
}

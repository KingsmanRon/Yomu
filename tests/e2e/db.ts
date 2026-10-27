import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-side checks for end-to-end tests (local Supabase only). Null when not configured. */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export function adminDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key || !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

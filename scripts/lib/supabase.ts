import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for maintenance scripts. Reads .env.local when present.
 * Refuses any Supabase that is not local unless --allow-remote is passed, so
 * a script cannot change a shared or production database by accident.
 */
export function scriptClient(purpose: string): SupabaseClient {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).");
    process.exit(1);
  }
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
  if (!local && !process.argv.includes("--allow-remote")) {
    console.error(`Refusing to ${purpose} on ${url}: it is not a local Supabase. Pass --allow-remote only when that is intended and authorised.`);
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Throws with the operation name when a Supabase call fails. */
export async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

/** Runs `fn` over `rows` in chunks (PostgREST requests stay small). */
export async function inChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

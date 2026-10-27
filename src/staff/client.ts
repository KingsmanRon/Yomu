"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, backendConfigured } from "@/config/app";

/**
 * Supabase client for staff (facilitators, organisation admins, content
 * reviewers). Staff sign in with email and password on their own devices.
 * Every read goes through row-level security and the consent-filtered
 * database functions, so the browser only ever receives what the signed-in
 * person may see.
 */
let client: SupabaseClient | null = null;

export function staffClient(): SupabaseClient {
  if (!backendConfigured()) throw new Error("backend_not_configured");
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storageKey: "yomu-staff", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function staffToken(): Promise<string | null> {
  const { data } = await staffClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Download a file from a staff API route (the bearer token cannot go in a plain link). */
export async function downloadWithToken(path: string, filename: string): Promise<void> {
  const token = await staffToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      // Not JSON.
    }
    throw new Error(message);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export class StaffApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** JSON call to a staff API route with the signed-in staff member's token. */
export async function staffApi<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const token = await staffToken();
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new StaffApiError(res.status, data.error ?? "error", data.message ?? `Request failed (${res.status})`);
  return data as T;
}

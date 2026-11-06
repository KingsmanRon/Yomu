import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { totp } from "../totp";

/**
 * Database test helpers. Everything goes through the real Auth and PostgREST
 * APIs of a local Supabase (`npx supabase start`), with genuine user tokens,
 * so row-level security and the database functions are tested as the app
 * uses them. Each test creates its own users, organisation and class.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
if (!URL_ || !PUBLISHABLE || !SECRET) throw new Error("Database tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error(`Refusing to run database tests against ${URL_}`);

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)) throw new Error("Refusing direct SQL against a non-local database");

/** Direct SQL on the local test database, for injecting faults (never used against anything else). */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/**
 * Runs `fn` while every insert into `table` for this learner fails, to prove
 * that the operation under test changes nothing unless all of it succeeds.
 */
export async function withFailingInsert<T>(table: string, learnerId: string, fn: () => Promise<T>): Promise<T> {
  const name = `test_fail_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await sql(`create function public.${name}() returns trigger language plpgsql as $f$ begin if new.learner_id = '${learnerId}' then raise exception 'injected failure'; end if; return new; end $f$`);
  await sql(`create trigger ${name} before insert on public.${table} for each row execute function public.${name}()`);
  try {
    return await fn();
  } finally {
    await sql(`drop trigger if exists ${name} on public.${table}`);
    await sql(`drop function if exists public.${name}()`);
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export const admin: SupabaseClient = createClient(URL_, SECRET, opts);
export const anon: SupabaseClient = createClient(URL_, PUBLISHABLE, opts);

export function asUser(token: string): SupabaseClient {
  return createClient(URL_, PUBLISHABLE, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
}

/** The data of a successful call (throws on an error or no data). */
export async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(JSON.stringify(error));
  if (data === null || data === undefined) throw new Error("no data returned");
  return data as NonNullable<T>;
}

/** A write that returns no data: throws on an error. */
export async function ok(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(JSON.stringify(error));
}

const created = { users: [] as string[], orgs: [] as string[], learners: [] as string[] };

export interface TestLearner {
  id: string;
  userId: string;
  db: SupabaseClient;
}

/** An anonymous Auth user (as the phone creates after consent) linked to a learner row. */
export async function newLearner(nickname: string, language: "zu" | "st" = "zu"): Promise<TestLearner> {
  // A fresh client per learner: signing in must not change the shared anonymous client.
  const { data, error } = await createClient(URL_, PUBLISHABLE, opts).auth.signInAnonymously();
  if (error || !data.session || !data.user) throw error ?? new Error("no session");
  created.users.push(data.user.id);
  const row = await must(
    admin.from("learners").insert({ auth_user_id: data.user.id, teaching_language: language, avatar_id: "avatar-sun", nickname }).select("id").single(),
  );
  created.learners.push(row.id);
  await ok(admin.from("learner_credentials").insert({ learner_id: row.id, pin_hash: "scrypt$test" }));
  await ok(admin.from("consent_records").insert({ learner_id: row.id, consent_type: "account_storage", version: "test", language }));
  return { id: row.id, userId: data.user.id, db: asUser(data.session.access_token) };
}

export interface TestStaff {
  userId: string;
  email: string;
  password: string;
  /** Key of the staff member's authenticator app; null for an account without two-step sign-in. */
  totpSecret: string | null;
  token: string;
  db: SupabaseClient;
}

/**
 * A staff account as an administrator creates it. By default it has set up
 * its authenticator and is signed in with both steps (aal2), as staff access
 * requires; `{ mfa: false }` gives an account with a password-only session.
 */
export async function newStaff(
  role: "facilitator" | "org_admin" | "content_reviewer" | "platform_admin",
  orgId: string | null,
  { mfa = true }: { mfa?: boolean } = {},
): Promise<TestStaff> {
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@db-test.yomu.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  created.users.push(data.user.id);
  await ok(admin.from("staff_roles").insert({ user_id: data.user.id, role, organisation_id: role === "facilitator" || role === "org_admin" ? orgId : null }));
  const client = createClient(URL_, PUBLISHABLE, opts);
  const { data: s, error: e } = await client.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw e ?? new Error("no session");
  const staff: TestStaff = { userId: data.user.id, email, password, totpSecret: null, token: s.session.access_token, db: asUser(s.session.access_token) };
  if (!mfa) return staff;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrolled.error || !enrolled.data) throw enrolled.error ?? new Error("no factor");
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
  if (verified.error || !verified.data) throw verified.error ?? new Error("not verified");
  return { ...staff, totpSecret: enrolled.data.totp.secret, token: verified.data.access_token, db: asUser(verified.data.access_token) };
}

/** Another session of an existing staff member: password only, or with the authenticator code too. */
export async function signInStaff(staff: TestStaff, { mfa = true }: { mfa?: boolean } = {}): Promise<{ token: string; client: SupabaseClient }> {
  const client = createClient(URL_, PUBLISHABLE, opts);
  const { data, error } = await client.auth.signInWithPassword({ email: staff.email, password: staff.password });
  if (error || !data.session) throw error ?? new Error("no session");
  if (!mfa) return { token: data.session.access_token, client };
  const factor = data.user.factors?.find((f) => f.status === "verified");
  if (!factor || !staff.totpSecret) throw new Error("this staff member has no authenticator");
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(staff.totpSecret) });
  if (verified.error || !verified.data) throw verified.error ?? new Error("not verified");
  return { token: verified.data.access_token, client };
}

/** Removes an Auth user created outside these helpers at cleanup. */
export function trackUser(userId: string): void {
  created.users.push(userId);
}

/** A fresh anonymous Auth session, as a phone creates one after spoken consent. Removed by cleanup(). */
export async function newAnonymousSession(): Promise<{ userId: string; token: string }> {
  const { data, error } = await createClient(URL_, PUBLISHABLE, opts).auth.signInAnonymously();
  if (error || !data.session || !data.user) throw error ?? new Error("no session");
  created.users.push(data.user.id);
  return { userId: data.user.id, token: data.session.access_token };
}

/** Calls a route handler in-process with a real bearer token, as the app does over HTTP. */
export async function callRoute(
  route: (request: Request) => Promise<Response>,
  init: { method?: string; token?: string; body?: unknown; url?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await route(
    new Request(init.url ?? "http://localhost/api/test", {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

export async function newOrg(): Promise<string> {
  const row = await must(admin.from("organisations").insert({ name: `DB test ${crypto.randomUUID().slice(0, 6)}`, kind: "ngo" }).select("id").single());
  created.orgs.push(row.id);
  return row.id;
}

export async function newCohort(orgId: string, facilitator: TestStaff): Promise<{ id: string; code: string }> {
  const code = String(Math.floor(100000 + Math.random() * 899999));
  const row = await must(admin.from("cohorts").insert({ organisation_id: orgId, name: `Class ${code}`, join_code: code }).select("id").single());
  await ok(admin.from("cohort_facilitators").insert({ cohort_id: row.id, user_id: facilitator.userId }));
  return { id: row.id, code };
}

export async function join(learner: TestLearner, code: string, share: { mastery: boolean; mistakes: boolean; tutorLogs: boolean }) {
  return must(admin.rpc("join_cohort", { p_learner: learner.id, p_code: code, p_share: share, p_version: "test", p_language: "zu" }));
}

/** Two first attempts (one wrong) and a completed lesson, stored the way /api/sync stores them. */
export async function addActivity(learner: TestLearner) {
  const device = crypto.randomUUID();
  await ok(admin.from("device_profiles").insert({ id: device, learner_id: learner.id }));
  const at = new Date().toISOString();
  const day = at.slice(0, 10);
  const attempt = (outcome: "correct" | "incorrect") => ({
    id: crypto.randomUUID(),
    type: "attempt",
    at,
    localDate: day,
    data: {
      lessonId: "l00-hl-vowels",
      exerciseId: "l00-hl-vowels.e01",
      exerciseType: "letter_sound",
      itemId: "zu.l.a",
      objectiveIds: ["obj.l00.hl-vowels"],
      evidence: [{ competency: "decode", weight: 1 }],
      outcome,
      attemptNumber: 1,
      supported: false,
      ...(outcome === "incorrect" ? { errorType: "wrong_choice" } : {}),
    },
  });
  const ops = [
    attempt("incorrect"),
    attempt("correct"),
    { id: crypto.randomUUID(), type: "lesson_complete", at, localDate: day, data: { lessonId: "l00-hl-vowels", correct: 1, total: 2, durationMs: 1000 } },
  ];
  await must(admin.rpc("sync_ingest", { p_learner: learner.id, p_device: device, p_ops: ops }));
  await ok(admin.from("learner_progress").upsert({ learner_id: learner.id, xp: 12, lessons_completed: 1, objectives_mastered: 1, current_level: 0, last_active_date: day }));
  await ok(
    admin.from("objective_mastery").upsert({ learner_id: learner.id, objective_id: "obj.l00.hl-vowels", status: "mastered", first_mastered_at: at, competencies: { decode: { status: "mastered", events: 4, correct: 4 } } }),
  );
  await ok(
    admin.from("tutor_logs").insert({ learner_id: learner.id, tier: 2, language: "zu", lesson_id: "l00-hl-vowels", request_text: "kusho ukuthini", intent: "meaning", expires_at: new Date(Date.now() + 86400000).toISOString() }),
  );
}

export async function cleanup() {
  // Learners created through the app's routes are found by their Auth user.
  if (created.users.length > 0) {
    const { data } = await admin.from("learners").select("id").in("auth_user_id", created.users);
    for (const l of data ?? []) if (!created.learners.includes(l.id)) created.learners.push(l.id);
  }
  for (const id of created.learners) await admin.rpc("delete_learner", { p_learner: id, p_initiated_by: "platform_admin" });
  for (const id of created.orgs) await admin.from("organisations").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  created.users = [];
  created.orgs = [];
  created.learners = [];
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addActivity, admin, asUser, callRoute, cleanup, join, newAnonymousSession, newCohort, newOrg, newStaff, sql, type TestStaff } from "./helpers";
import { POST as analytics } from "@/app/api/analytics/route";
import { POST as resetPin } from "@/app/api/assist/pin-reset/route";
import { POST as consent } from "@/app/api/learner/consent/route";
import { POST as deleteLearner } from "@/app/api/learner/delete/route";
import { GET as me } from "@/app/api/learner/me/route";
import { POST as register } from "@/app/api/learner/register/route";
import { CONSENT_VERSION } from "@/config/app";

/**
 * Deleting an account (the learner's own deletion, which is also how
 * consent to online storage is withdrawn) removes every row about the
 * learner, in the app's tables and in Auth, in one transaction. Checked by
 * scanning every table for the learner's identifiers afterwards.
 */
afterAll(cleanup);

let facilitator: TestStaff;
let cohort: { id: string; code: string };

beforeAll(async () => {
  const org = await newOrg();
  facilitator = await newStaff("facilitator", org);
  cohort = await newCohort(org, facilitator);
});

async function registeredLearner() {
  const s = await newAnonymousSession();
  const res = await callRoute(register, {
    token: s.token,
    body: { deviceProfileId: crypto.randomUUID(), teachingLanguage: "zu", avatarId: "avatar-sun", pin: "2468", consent: { version: CONSENT_VERSION, language: "zu", analytics: true } },
  });
  if (res.status !== 201) throw new Error(`registration failed: ${JSON.stringify(res.body)}`);
  const learnerId = res.body!.learnerId as string;
  const { pseudonym } = (await admin.from("learners").select("pseudonym").eq("id", learnerId).single()).data!;
  return { ...s, learnerId, pseudonym: pseudonym as string };
}

/**
 * Every column of every table in the app's schema and in Auth that holds one
 * of `values` (exactly, or inside JSON), with its row count. Auth's own audit
 * log is left out: it records events by the random user ID only.
 */
async function traces(values: string[]): Promise<Record<string, number>> {
  const columns = await sql<{ s: string; t: string; c: string; json: boolean }>(
    `select c.table_schema as s, c.table_name as t, c.column_name as c, c.data_type in ('json', 'jsonb') as json
     from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema in ('public', 'auth') and c.data_type in ('uuid', 'text', 'character varying', 'json', 'jsonb')
       and not (c.table_schema = 'auth' and c.table_name = 'audit_log_entries')`,
  );
  const found: Record<string, number> = {};
  for (const col of columns) {
    const where = col.json ? `"${col.c}"::text like any($1::text[])` : `"${col.c}"::text = any($1::text[])`;
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int as n from "${col.s}"."${col.t}" where ${where}`, [col.json ? values.map((v) => `%${v}%`) : values]);
    if (n > 0) found[`${col.s}.${col.t}.${col.c}`] = n;
  }
  return found;
}

/** A learner with data in every kind of table: activity, a class, consents, usage counts, an error, an assisted reset, a pending move. */
async function learnerWithEverything() {
  const learner = await registeredLearner();
  const oldPhone = await newAnonymousSession();
  await addActivity({ id: learner.learnerId, userId: learner.userId, db: asUser(learner.token) });
  await join({ id: learner.learnerId, userId: learner.userId, db: asUser(learner.token) }, cohort.code, { mastery: true, mistakes: true, tutorLogs: true });
  expect((await callRoute(analytics, { token: learner.token, body: { events: [{ event: "lesson_start", props: { lessonId: "l00-hl-vowels" } }] } })).body?.recorded).toBe(1);
  await sql("insert into public.error_logs (message, pseudonym) values ('deletion-test error', $1)", [learner.pseudonym]);
  await sql("select public.tutor_rate_check($1, 2::smallint, 10, 100)", [learner.learnerId]);
  expect((await callRoute(resetPin, { token: facilitator.token, body: { learnerId: learner.learnerId, newPin: "1357" } })).status).toBe(200);
  await sql(
    `insert into public.device_transfers (id, learner_id, facilitator_user_id, cohort_id, new_auth_user_id, old_auth_user_id, device_profile_id, pin_reset, status)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, gen_random_uuid(), false, 'revocation_pending')`,
    [learner.learnerId, facilitator.userId, cohort.id, learner.userId, oldPhone.userId],
  );
  return { ...learner, oldPhoneUserId: oldPhone.userId };
}

describe("deleting an account", () => {
  it("removes every trace of the learner from the app's tables and from Auth, in one request", async () => {
    const learner = await learnerWithEverything();
    const ids = [learner.learnerId, learner.pseudonym, learner.userId, learner.oldPhoneUserId];
    const before = await traces(ids);
    for (const table of [
      "public.learners.id",
      "public.learner_credentials.learner_id",
      "public.consent_records.learner_id",
      "public.device_profiles.learner_id",
      "public.cohort_memberships.learner_id",
      "public.sync_operations.learner_id",
      "public.learning_attempts.learner_id",
      "public.lesson_completions.learner_id",
      "public.learner_progress.learner_id",
      "public.objective_mastery.learner_id",
      "public.tutor_logs.learner_id",
      "public.tutor_requests.learner_id",
      "public.join_attempts.learner_id",
      "public.facilitator_assists.learner_id",
      "public.device_transfers.learner_id",
      "public.analytics_events.pseudonym",
      "public.error_logs.pseudonym",
      "auth.users.id",
      "auth.sessions.user_id",
      "auth.refresh_tokens.user_id",
    ])
      expect(before[table], table).toBeGreaterThan(0);
    const logged = (await sql<{ n: number }>("select count(*)::int as n from public.deletion_log"))[0].n;

    const res = await callRoute(deleteLearner, { token: learner.token, body: {} });
    expect(res.status).toBe(200);
    expect(await traces(ids)).toEqual({});
    expect((await sql<{ n: number }>("select count(*)::int as n from public.deletion_log"))[0].n).toBe(logged + 1);
    // Staff and the class are untouched.
    expect((await admin.from("cohorts").select("id").eq("id", cohort.id)).data).toHaveLength(1);
    expect((await callRoute(resetPin, { token: facilitator.token, body: { learnerId: learner.learnerId, newPin: "1357" } })).status).toBe(403);
  });

  it("a repeated request after a lost reply finds the session gone, and changes nothing more", async () => {
    const learner = await registeredLearner();
    expect((await callRoute(deleteLearner, { token: learner.token, body: {} })).status).toBe(200);
    const logged = (await sql<{ n: number }>("select count(*)::int as n from public.deletion_log"))[0].n;
    const again = await callRoute(deleteLearner, { token: learner.token, body: {} });
    expect([again.status, again.body?.error]).toEqual([401, "unauthenticated"]);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.deletion_log"))[0].n).toBe(logged);
  });

  it("if Auth cannot be changed inside the transaction, the learner's data is still deleted and the route removes the Auth user", async () => {
    const learner = await registeredLearner();
    // Refuse deletes of this user made by the database function (as its owner), not those made by Auth itself.
    await sql(
      `create or replace function public.test_block_auth_delete() returns trigger language plpgsql as $f$
       begin if old.id = '${learner.userId}' and current_user = 'postgres' then raise exception 'injected failure'; end if; return old; end $f$`,
    );
    await sql("create trigger test_block_auth_delete before delete on auth.users for each row execute function public.test_block_auth_delete()");
    try {
      const res = await callRoute(deleteLearner, { token: learner.token, body: {} });
      expect(res.status).toBe(200);
    } finally {
      await sql("drop trigger if exists test_block_auth_delete on auth.users");
      await sql("drop function if exists public.test_block_auth_delete()");
    }
    expect(await traces([learner.learnerId, learner.pseudonym, learner.userId])).toEqual({});
  });

  it("only ever deletes anonymous Auth users", async () => {
    const learner = await registeredLearner();
    // A corrupted link to a staff account must not take the staff account with it.
    await sql("update public.learners set auth_user_id = $1 where id = $2", [facilitator.userId, learner.learnerId]);
    expect((await admin.rpc("delete_learner", { p_learner: learner.learnerId, p_initiated_by: "platform_admin" })).data).toBe(true);
    expect(await sql("select id from auth.users where id = $1", [facilitator.userId])).toHaveLength(1);
    expect((await admin.from("learners").select("id").eq("id", learner.learnerId)).data).toEqual([]);
  });

  it("withdrawing consent to usage counts stops them at once, and deletion removes those already stored", async () => {
    const learner = await registeredLearner();
    const events = { events: [{ event: "lesson_start", props: {} }] };
    expect((await callRoute(analytics, { token: learner.token, body: events })).body?.recorded).toBe(1);
    await callRoute(consent, { token: learner.token, body: { type: "analytics", granted: false, version: CONSENT_VERSION, language: "zu" } });
    expect((await callRoute(analytics, { token: learner.token, body: events })).body?.recorded).toBe(0);
    const consents = (await callRoute(me, { token: learner.token })).body!.consents as { consent_type: string; withdrawn_at: string | null }[];
    expect(consents.find((c) => c.consent_type === "analytics")?.withdrawn_at).toBeTruthy();
    expect((await callRoute(deleteLearner, { token: learner.token, body: {} })).status).toBe(200);
    expect((await admin.from("analytics_events").select("id").eq("pseudonym", learner.pseudonym)).data).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { URL_, admin, anon, asUser, callRoute, cleanup, join, newCohort, newLearner, newOrg, newStaff, signInStaff, sql, trackUser, type TestStaff } from "./helpers";
import { totp } from "../totp";
import { POST as staffMfaReset } from "@/app/api/admin/staff-mfa-reset/route";
import { GET as pilotMetrics } from "@/app/api/admin/pilot-metrics/route";
import { GET as assistLearners } from "@/app/api/assist/learners/route";
import { POST as resetPin } from "@/app/api/assist/pin-reset/route";
import { POST as transfer } from "@/app/api/assist/transfer/route";
import { GET as learnerMe } from "@/app/api/learner/me/route";
import { GET as evidence } from "@/app/api/staff/evidence/route";
import { POST as recover } from "@/app/api/staff/mfa/recover/route";
import { GET as recoveryCodeCount, POST as newRecoveryCodes } from "@/app/api/staff/mfa/recovery-codes/route";

/**
 * Mandatory two-step sign-in for staff, through the real routes, Auth and
 * database: a password alone opens nothing (server routes, row-level
 * security and staff functions all need aal2 on a live session), recovery
 * codes are one-time and rate-limited, and only a platform administrator can
 * reset someone else's authenticator. Learners never need a second factor.
 */
afterAll(cleanup);

const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

async function factors(userId: string) {
  return sql<{ status: string }>("select status::text from auth.mfa_factors where user_id = $1", [userId]);
}

async function sessions(userId: string) {
  return sql<{ id: string }>("select id from auth.sessions where user_id = $1", [userId]);
}

async function events(userId: string) {
  return (await admin.from("staff_security_events").select("event, actor_user_id").eq("user_id", userId).order("id")).data ?? [];
}

async function codesFor(staff: { token: string }): Promise<string[]> {
  const res = await callRoute(newRecoveryCodes, { method: "POST", token: staff.token });
  if (res.status !== 200) throw new Error(`no recovery codes: ${JSON.stringify(res.body)}`);
  return res.body!.codes as string[];
}

let org: string;
let facilitator: TestStaff;
let cohort: { id: string; code: string };

beforeAll(async () => {
  org = await newOrg();
  facilitator = await newStaff("facilitator", org);
  cohort = await newCohort(org, facilitator);
});

describe("staff need a second factor", () => {
  it("every staff route refuses a password-only session, without side effects", async () => {
    const learner = await newLearner("Busi");
    await join(learner, cohort.code, { mastery: true, mistakes: false, tutorLogs: false });
    const platformAdmin = await newStaff("platform_admin", null);
    const password = await signInStaff(facilitator, { mfa: false });
    const adminPassword = await signInStaff(platformAdmin, { mfa: false });
    const calls = [
      callRoute(assistLearners, { token: password.token }),
      callRoute(resetPin, { token: password.token, body: { learnerId: learner.id, newPin: "1357" } }),
      callRoute(transfer, {
        token: password.token,
        body: { transferId: crypto.randomUUID(), learnerId: learner.id, deviceProfileId: crypto.randomUUID(), deviceToken: password.token, newPin: "1357" },
      }),
      callRoute(evidence, { token: password.token, url: `http://localhost/api/staff/evidence?cohort=${cohort.id}&format=csv` }),
      callRoute(recoveryCodeCount, { token: password.token }),
      callRoute(newRecoveryCodes, { method: "POST", token: password.token }),
      callRoute(pilotMetrics, { token: adminPassword.token }),
      callRoute(staffMfaReset, { token: adminPassword.token, body: { email: facilitator.email } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe("mfa_required");
    }
    expect(await factors(facilitator.userId)).toEqual([{ status: "verified" }]);
    expect((await admin.from("facilitator_assists").select("id").eq("learner_id", learner.id)).data).toEqual([]);
    expect((await admin.from("staff_mfa_recovery_codes").select("id").eq("user_id", facilitator.userId)).data).toEqual([]);

    // The same account with both steps is let in.
    expect((await callRoute(assistLearners, { token: facilitator.token })).status).toBe(200);
    expect((await callRoute(pilotMetrics, { token: platformAdmin.token })).status).toBe(200);
  });

  it("the database gives a password-only session no staff data or staff functions", async () => {
    const learner = await newLearner("Sipho");
    await join(learner, cohort.code, { mastery: true, mistakes: true, tutorLogs: true });
    const reviewer = await newStaff("content_reviewer", null);
    const orgAdmin = await newStaff("org_admin", org);
    const db = asUser((await signInStaff(facilitator, { mfa: false })).token);
    const reviewerDb = asUser((await signInStaff(reviewer, { mfa: false })).token);
    const orgAdminDb = asUser((await signInStaff(orgAdmin, { mfa: false })).token);

    expect((await db.from("cohorts").select("id")).data).toEqual([]);
    expect((await db.from("organisations").select("id")).data).toEqual([]);
    expect((await db.from("cohort_memberships").select("learner_id")).data).toEqual([]);
    expect((await db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id })).error?.code).toBe("42501");
    expect((await db.rpc("create_cohort", { p_org: org, p_name: "Not allowed" })).error?.code).toBe("42501");
    expect((await db.from("cohorts").update({ name: "Renamed" }).eq("id", cohort.id).select("id")).data).toEqual([]);
    expect((await reviewerDb.from("content_assets").select("id").limit(1)).data).toEqual([]);
    expect((await orgAdminDb.rpc("org_cohort_summaries", { p_org: org })).error?.code).toBe("42501");
    // Their own role is readable, so the staff pages know to ask for the code.
    expect((await db.from("staff_roles").select("role")).data).toEqual([{ role: "facilitator" }]);

    // With both steps, the same reads work.
    expect((await facilitator.db.from("cohorts").select("id").eq("id", cohort.id)).data).toEqual([{ id: cohort.id }]);
    const visible = (await facilitator.db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id })).data as { learner_id: string }[];
    expect(visible.map((r) => r.learner_id)).toContain(learner.id);
    expect((await reviewer.db.from("content_assets").select("id").limit(1)).data).toHaveLength(1);
    expect((await orgAdmin.db.rpc("org_cohort_summaries", { p_org: org })).error).toBeNull();
    expect((await sql("select name from public.cohorts where id = $1", [cohort.id]))[0]).toEqual({ name: `Class ${cohort.code}` });
  });

  it("a signed-out session loses staff access at once, before its access token expires", async () => {
    const other = await signInStaff(facilitator);
    const db = asUser(other.token);
    expect((await db.from("cohorts").select("id").eq("id", cohort.id)).data).toEqual([{ id: cohort.id }]);
    await other.client.auth.signOut({ scope: "local" });
    expect((await db.from("cohorts").select("id").eq("id", cohort.id)).data).toEqual([]);
    expect((await db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id })).error?.code).toBe("42501");
    expect((await callRoute(assistLearners, { token: other.token })).status).toBe(401);
    // Other sessions are unaffected.
    expect((await callRoute(assistLearners, { token: facilitator.token })).status).toBe(200);
  });

  it("learners keep their picture-and-code access without any second factor", async () => {
    const { data } = await createClient(URL_, PUBLISHABLE, opts).auth.signInAnonymously();
    trackUser(data.user!.id);
    const learner = (await admin.from("learners").insert({ auth_user_id: data.user!.id, teaching_language: "st", avatar_id: "avatar-sun" }).select("id").single()).data!;
    expect(await sql<{ aal: string }>("select aal::text from auth.sessions where user_id = $1", [data.user!.id])).toEqual([{ aal: "aal1" }]);
    const res = await callRoute(learnerMe, { token: data.session!.access_token });
    expect(res.status).toBe(200);
    expect((res.body!.learner as { id: string }).id).toBe(learner.id);
    expect((await asUser(data.session!.access_token).from("learners").select("id")).data).toEqual([{ id: learner.id }]);
  });

  it("nobody can make a usable account by signing up themselves", async () => {
    const email = `self-${crypto.randomUUID().slice(0, 8)}@db-test.yomu.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await createClient(URL_, PUBLISHABLE, opts).auth.signUp({ email, password });
    if (data.user) trackUser(data.user.id);
    expect(error).toBeNull();
    expect(data.session).toBeNull();
    // Without access to the inbox the account cannot sign in, so nobody can claim a future staff address.
    const signIn = await createClient(URL_, PUBLISHABLE, opts).auth.signInWithPassword({ email, password });
    expect(signIn.data.session).toBeNull();
    expect(signIn.error?.code).toBe("email_not_confirmed");
  });
});

describe("recovery codes", () => {
  it("are issued only with both steps, shown once, and stored as keyed hashes", async () => {
    const staff = await newStaff("facilitator", org);
    const codes = await codesFor(staff);
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(new Set(codes).size).toBe(10);
    const stored = (await admin.from("staff_mfa_recovery_codes").select("code_hash, used_at").eq("user_id", staff.userId)).data!;
    expect(stored).toHaveLength(10);
    for (const row of stored) {
      expect(row.used_at).toBeNull();
      for (const c of codes) expect(row.code_hash).not.toContain(c.replace(/-/g, ""));
    }
    expect((await callRoute(recoveryCodeCount, { token: staff.token })).body).toEqual({ remaining: 10 });
    expect((await events(staff.userId)).map((e) => e.event)).toEqual(["mfa_recovery_codes_issued"]);

    // New codes replace the old ones.
    const fresh = await codesFor(staff);
    const password = await signInStaff(staff, { mfa: false });
    expect((await callRoute(recover, { token: password.token, body: { code: codes[0] } })).status).toBe(403);
    expect((await callRoute(recover, { token: password.token, body: { code: fresh[0].toLowerCase().replace(/-/g, " ") } })).status).toBe(200);
  });

  it("a code removes the lost authenticator and ends every other session, once", async () => {
    const staff = await newStaff("facilitator", org);
    await sql("insert into public.cohort_facilitators (cohort_id, user_id) values ($1, $2)", [cohort.id, staff.userId]);
    const codes = await codesFor(staff);
    const stolenPhone = await signInStaff(staff);
    const password = await signInStaff(staff, { mfa: false });
    expect((await sessions(staff.userId)).length).toBe(3);

    const res = await callRoute(recover, { token: password.token, body: { code: codes[3] } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remaining: 9 });
    expect(await factors(staff.userId)).toEqual([]);
    expect((await sessions(staff.userId)).length).toBe(1);
    expect((await events(staff.userId)).map((e) => e.event)).toEqual(["mfa_recovery_codes_issued", "mfa_recovered"]);

    // The sessions that had the second factor no longer reach anything, through the server or the database.
    for (const token of [staff.token, stolenPhone.token]) {
      expect((await callRoute(assistLearners, { token })).status).toBe(401);
      expect((await asUser(token).from("cohorts").select("id")).data).toEqual([]);
    }
    // A spent code does not work again.
    expect((await callRoute(recover, { token: password.token, body: { code: codes[3] } })).status).toBe(403);

    // The remaining password session sets up a new authenticator and is let in.
    const enrolled = await password.client.auth.mfa.enroll({ factorType: "totp" });
    expect(enrolled.error).toBeNull();
    const verified = await password.client.auth.mfa.challengeAndVerify({ factorId: enrolled.data!.id, code: totp(enrolled.data!.totp.secret) });
    expect(verified.error).toBeNull();
    expect((await callRoute(assistLearners, { token: verified.data!.access_token })).status).toBe(200);
  });

  it("allow at most 5 wrong codes per 15 minutes, also when tried in parallel", async () => {
    const staff = await newStaff("org_admin", org);
    const codes = await codesFor(staff);
    const password = await signInStaff(staff, { mfa: false });
    const wrong = Array.from({ length: 8 }, () => callRoute(recover, { token: password.token, body: { code: "AAAA-BBBB-CCCC" } }));
    const statuses = (await Promise.all(wrong)).map((r) => r.status).sort();
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429, 429, 429]);
    // While waiting, even a right code is not checked (and not spent).
    const blocked = await callRoute(recover, { token: password.token, body: { code: codes[0] } });
    expect(blocked.status).toBe(429);
    expect(blocked.body?.error).toBe("recovery_wait");
    expect(await factors(staff.userId)).toEqual([{ status: "verified" }]);
    expect((await events(staff.userId)).filter((e) => e.event === "mfa_recovery_failed")).toHaveLength(5);
    expect((await callRoute(recoveryCodeCount, { token: staff.token })).body).toEqual({ remaining: 10 });
  });

  it("need a staff member's own session: learners and unauthenticated callers are refused", async () => {
    const learner = await createClient(URL_, PUBLISHABLE, opts).auth.signInAnonymously();
    trackUser(learner.data.user!.id);
    expect((await callRoute(recover, { token: learner.data.session!.access_token, body: { code: "AAAA-BBBB-CCCC" } })).status).toBe(403);
    expect((await callRoute(recover, { body: { code: "AAAA-BBBB-CCCC" } })).status).toBe(401);
    expect((await callRoute(newRecoveryCodes, { method: "POST", token: learner.data.session!.access_token })).status).toBe(403);
  });

  it("the database functions behind them cannot be called by any signed-in user", async () => {
    const calls = [
      facilitator.db.rpc("staff_mfa_issue_recovery_codes", { p_user: facilitator.userId, p_hashes: Array(10).fill("x") }),
      facilitator.db.rpc("staff_mfa_recover", { p_user: facilitator.userId, p_code_hash: "x", p_session: null }),
      facilitator.db.rpc("staff_mfa_reset", { p_admin: facilitator.userId, p_email: facilitator.email }),
      anon.rpc("staff_mfa_recover", { p_user: facilitator.userId, p_code_hash: "x", p_session: null }),
    ];
    for (const { error } of await Promise.all(calls)) expect(error?.code).toBe("42501");
    expect((await facilitator.db.from("staff_mfa_recovery_codes").select("id")).error?.code).toBe("42501");
    expect((await facilitator.db.from("staff_security_events").select("id")).error?.code).toBe("42501");
  });
});

describe("reset by a platform administrator", () => {
  it("only a platform administrator with both steps can reset someone else", async () => {
    const target = await newStaff("facilitator", org);
    const platformAdmin = await newStaff("platform_admin", null);
    const orgAdmin = await newStaff("org_admin", org);
    expect((await callRoute(staffMfaReset, { token: orgAdmin.token, body: { email: target.email } })).status).toBe(403);
    expect((await callRoute(staffMfaReset, { token: facilitator.token, body: { email: target.email } })).status).toBe(403);
    expect((await callRoute(staffMfaReset, { token: (await signInStaff(platformAdmin, { mfa: false })).token, body: { email: target.email } })).body?.error).toBe(
      "mfa_required",
    );
    expect((await callRoute(staffMfaReset, { token: platformAdmin.token, body: { email: platformAdmin.email } })).status).toBe(400);
    expect((await callRoute(staffMfaReset, { token: platformAdmin.token, body: { email: "nobody@db-test.yomu.test" } })).status).toBe(404);
    expect(await factors(target.userId)).toEqual([{ status: "verified" }]);
  });

  it("removes the authenticator, recovery codes and every session, and records who did it", async () => {
    const target = await newStaff("facilitator", org);
    await codesFor(target);
    const platformAdmin = await newStaff("platform_admin", null);
    const res = await callRoute(staffMfaReset, { token: platformAdmin.token, body: { email: target.email.toUpperCase() } });
    expect(res.status).toBe(200);
    expect(await factors(target.userId)).toEqual([]);
    expect(await sessions(target.userId)).toEqual([]);
    expect((await admin.from("staff_mfa_recovery_codes").select("id").eq("user_id", target.userId)).data).toEqual([]);
    expect((await callRoute(assistLearners, { token: target.token })).status).toBe(401);
    expect((await events(target.userId)).at(-1)).toEqual({ event: "mfa_reset_by_admin", actor_user_id: platformAdmin.userId });

    // At the next sign-in the password alone still opens nothing until a new authenticator is set up.
    const again = await signInStaff(target, { mfa: false });
    expect((await callRoute(assistLearners, { token: again.token })).body?.error).toBe("mfa_required");
  });
});

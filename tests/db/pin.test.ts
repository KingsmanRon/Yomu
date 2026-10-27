import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, callRoute, cleanup, newAnonymousSession, newCohort, newOrg, newStaff, ok, sql, withFailingInsert, type TestStaff } from "./helpers";
import { GET as assistLearners } from "@/app/api/assist/learners/route";
import { POST as resetPin } from "@/app/api/assist/pin-reset/route";
import { POST as changePin } from "@/app/api/learner/pin/route";
import { POST as register } from "@/app/api/learner/register/route";
import { CONSENT_VERSION } from "@/config/app";
import { verifyPin } from "@/server/pin";

/**
 * Server-side PIN checks and facilitator-assisted resets, through the real
 * routes and database: attempts are counted before verification (so parallel
 * guesses wait like sequential ones), and a reset is authorised, applied and
 * audited in one transaction.
 */
afterAll(cleanup);

async function registeredLearner(pin = "2468") {
  const s = await newAnonymousSession();
  const res = await callRoute(register, {
    token: s.token,
    body: { deviceProfileId: crypto.randomUUID(), teachingLanguage: "zu", avatarId: "avatar-sun", pin, consent: { version: CONSENT_VERSION, language: "zu", analytics: false } },
  });
  if (res.status !== 201) throw new Error(`registration failed: ${JSON.stringify(res.body)}`);
  return { ...s, learnerId: res.body!.learnerId as string };
}

async function credentials(learnerId: string) {
  return (await admin.from("learner_credentials").select("pin_hash, failed_attempts, retry_after").eq("learner_id", learnerId).single()).data!;
}

async function assists(learnerId: string) {
  return (await admin.from("facilitator_assists").select("action, facilitator_user_id, cohort_id").eq("learner_id", learnerId)).data ?? [];
}

describe("server PIN checks", () => {
  it("changes the PIN only with the current PIN, and clears the count", async () => {
    const l = await registeredLearner("2468");
    const wrong = await callRoute(changePin, { token: l.token, body: { currentPin: "1111", newPin: "1357" } });
    expect(wrong.status).toBe(403);
    expect((await credentials(l.learnerId)).failed_attempts).toBe(1);

    const right = await callRoute(changePin, { token: l.token, body: { currentPin: "2468", newPin: "1357" } });
    expect(right.status).toBe(200);
    const c = await credentials(l.learnerId);
    expect(await verifyPin("1357", c.pin_hash)).toBe(true);
    expect(c).toMatchObject({ failed_attempts: 0, retry_after: null });
  });

  it("starts a growing wait after repeated wrong PINs, even for a right one during the wait", async () => {
    const l = await registeredLearner("2468");
    for (let i = 0; i < 4; i++) expect((await callRoute(changePin, { token: l.token, body: { currentPin: "1111", newPin: "1357" } })).status).toBe(403);
    expect((await credentials(l.learnerId)).retry_after).toBeNull();
    expect((await callRoute(changePin, { token: l.token, body: { currentPin: "1111", newPin: "1357" } })).status).toBe(403);
    expect((await credentials(l.learnerId)).retry_after).not.toBeNull();
    const during = await callRoute(changePin, { token: l.token, body: { currentPin: "2468", newPin: "1357" } });
    expect(during.status).toBe(429);
    expect(during.body).toMatchObject({ error: "pin_wait", retryAfter: expect.any(String) });
    expect(await verifyPin("2468", (await credentials(l.learnerId)).pin_hash)).toBe(true);
  });

  it("limits parallel guesses exactly like sequential ones", async () => {
    const l = await registeredLearner("2468");
    const guesses = Array.from({ length: 20 }, (_, i) => String(1111 + i).replace(/0/g, "9"));
    const results = await Promise.all(guesses.map((g) => callRoute(changePin, { token: l.token, body: { currentPin: g, newPin: "1357" } })));
    const checked = results.filter((r) => r.status === 403).length;
    expect(checked).toBe(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(15);
    expect((await credentials(l.learnerId)).failed_attempts).toBe(5);
  });

  it("waits longer after each further wrong PIN, up to four hours", async () => {
    const rows = await sql<{ d: number }>("select public.pin_retry_delay_seconds(n) as d from generate_series(1, 20) n order by n");
    expect(rows.map((r) => r.d)).toEqual([0, 0, 0, 0, 30, 60, 120, 240, 480, 960, 1920, 3840, 7680, 14400, 14400, 14400, 14400, 14400, 14400, 14400]);
  });
});

describe("facilitator-assisted PIN reset", () => {
  let org: string;
  let otherOrg: string;
  let facilitator: TestStaff;
  let otherFacilitator: TestStaff;
  let staleFacilitator: TestStaff;
  let orgAdmin: TestStaff;
  let cohort: { id: string; code: string };

  beforeAll(async () => {
    org = await newOrg();
    otherOrg = await newOrg();
    facilitator = await newStaff("facilitator", org);
    otherFacilitator = await newStaff("facilitator", otherOrg);
    // Facilitator role only in another organisation, but still linked to this class
    // (for example after their role here was removed): must not be able to help here.
    staleFacilitator = await newStaff("facilitator", otherOrg);
    orgAdmin = await newStaff("org_admin", org);
    cohort = await newCohort(org, facilitator);
    await ok(admin.from("cohort_facilitators").insert({ cohort_id: cohort.id, user_id: staleFacilitator.userId }));
  });

  async function learnerInClass() {
    const l = await registeredLearner("2468");
    await admin.rpc("join_cohort", { p_learner: l.learnerId, p_code: cohort.code, p_share: { mastery: false, mistakes: false, tutorLogs: false }, p_version: "test", p_language: "zu" });
    return l;
  }

  it("resets the PIN and records who helped, in one step", async () => {
    const l = await learnerInClass();
    const res = await callRoute(resetPin, { token: facilitator.token, body: { learnerId: l.learnerId, newPin: "1357" } });
    expect(res.status).toBe(200);
    const c = await credentials(l.learnerId);
    expect(await verifyPin("1357", c.pin_hash)).toBe(true);
    expect(c).toMatchObject({ failed_attempts: 0, retry_after: null });
    expect(await assists(l.learnerId)).toEqual([{ action: "pin_reset", facilitator_user_id: facilitator.userId, cohort_id: cohort.id }]);
  });

  it("never changes the PIN when the audit record cannot be written", async () => {
    const l = await learnerInClass();
    const res = await withFailingInsert("facilitator_assists", l.learnerId, () =>
      callRoute(resetPin, { token: facilitator.token, body: { learnerId: l.learnerId, newPin: "1357" } }),
    );
    expect(res.status).toBe(500);
    expect(await verifyPin("2468", (await credentials(l.learnerId)).pin_hash)).toBe(true);
    expect(await assists(l.learnerId)).toEqual([]);
  });

  it("refuses anyone who does not run the learner's class in its organisation", async () => {
    const l = await learnerInClass();
    const attempts = [
      { who: "facilitator of another organisation", token: otherFacilitator.token, status: 403 },
      { who: "facilitator linked to the class without the role in its organisation", token: staleFacilitator.token, status: 403 },
      { who: "organisation admin", token: orgAdmin.token, status: 403 },
      { who: "the learner", token: l.token, status: 403 },
      { who: "nobody", token: undefined, status: 401 },
    ];
    for (const a of attempts) {
      const res = await callRoute(resetPin, { token: a.token, body: { learnerId: l.learnerId, newPin: "1357" } });
      expect(res.status, a.who).toBe(a.status);
    }
    expect(await verifyPin("2468", (await credentials(l.learnerId)).pin_hash)).toBe(true);
    expect(await assists(l.learnerId)).toEqual([]);
  });

  it("stops at once when the class is archived or the learner leaves it", async () => {
    const l = await learnerInClass();
    await ok(admin.from("cohorts").update({ archived_at: new Date().toISOString() }).eq("id", cohort.id));
    try {
      expect((await callRoute(resetPin, { token: facilitator.token, body: { learnerId: l.learnerId, newPin: "1357" } })).status).toBe(403);
    } finally {
      await ok(admin.from("cohorts").update({ archived_at: null }).eq("id", cohort.id));
    }
    await admin.rpc("update_cohort_sharing", { p_learner: l.learnerId, p_cohort: cohort.id, p_share: { progress: false, mastery: false, mistakes: false, tutorLogs: false }, p_version: "test", p_language: "zu" });
    expect((await callRoute(resetPin, { token: facilitator.token, body: { learnerId: l.learnerId, newPin: "1357" } })).status).toBe(403);
    expect(await verifyPin("2468", (await credentials(l.learnerId)).pin_hash)).toBe(true);
  });

  it("lists in assisted mode only the learners of classes run in the facilitator's own organisation", async () => {
    const l = await learnerInClass();
    const mine = await callRoute(assistLearners, { token: facilitator.token });
    const ids = (body: Record<string, unknown> | null) => ((body?.cohorts ?? []) as { learners: { learnerId: string }[] }[]).flatMap((c) => c.learners.map((x) => x.learnerId));
    expect(ids(mine.body)).toContain(l.learnerId);
    const stale = await callRoute(assistLearners, { token: staleFacilitator.token });
    expect(stale.status).toBe(200);
    expect(ids(stale.body)).not.toContain(l.learnerId);
  });
});

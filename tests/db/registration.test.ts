import { afterAll, describe, expect, it } from "vitest";
import { admin, callRoute, cleanup, newAnonymousSession, newOrg, newStaff } from "./helpers";
import { POST as register } from "@/app/api/learner/register/route";
import { CONSENT_VERSION } from "@/config/app";

/**
 * Registration (POST /api/learner/register) against the real database: one
 * transaction, server-authorised, idempotent and safe under concurrency.
 */
afterAll(cleanup);

const body = (over: Record<string, unknown> = {}) => ({
  deviceProfileId: crypto.randomUUID(),
  teachingLanguage: "zu",
  avatarId: "avatar-sun",
  pin: "2468",
  consent: { version: CONSENT_VERSION, language: "zu", analytics: false },
  ...over,
});

/** Everything stored for the learner bound to an Auth user. */
async function storedFor(userId: string) {
  const learners = (await admin.from("learners").select("id").eq("auth_user_id", userId)).data ?? [];
  const id = learners[0]?.id as string | undefined;
  if (!id) return { learners: 0, credentials: 0, devices: 0, consents: [] as string[] };
  const count = async (table: string) => (await admin.from(table).select("*", { count: "exact", head: true }).eq("learner_id", id)).count ?? 0;
  const consents = ((await admin.from("consent_records").select("consent_type").eq("learner_id", id)).data ?? []).map((c) => c.consent_type as string).sort();
  return { learners: learners.length, credentials: await count("learner_credentials"), devices: await count("device_profiles"), consents };
}

describe("registration", () => {
  it("stores the learner, PIN hash, phone link and consent together", async () => {
    const s = await newAnonymousSession();
    const res = await callRoute(register, { token: s.token, body: body() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ alreadyRegistered: false, learnerId: expect.any(String) });
    expect(await storedFor(s.userId)).toEqual({ learners: 1, credentials: 1, devices: 1, consents: ["account_storage"] });
    const cred = (await admin.from("learner_credentials").select("pin_hash").eq("learner_id", res.body!.learnerId as string).single()).data!;
    expect(cred.pin_hash).toMatch(/^scrypt\$/);
    expect(cred.pin_hash).not.toContain("2468");
  });

  it("records usage-counts consent only when the learner said yes", async () => {
    const s = await newAnonymousSession();
    const res = await callRoute(register, { token: s.token, body: body({ consent: { version: CONSENT_VERSION, language: "zu", analytics: true } }) });
    expect(res.status).toBe(201);
    expect((await storedFor(s.userId)).consents).toEqual(["account_storage", "analytics"]);
  });

  it("answers a retried request with the learner already created", async () => {
    const s = await newAnonymousSession();
    const b = body();
    const first = await callRoute(register, { token: s.token, body: b });
    const again = await callRoute(register, { token: s.token, body: b });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ learnerId: first.body!.learnerId, alreadyRegistered: true });
    expect(await storedFor(s.userId)).toMatchObject({ learners: 1, credentials: 1, devices: 1 });
  });

  it("creates exactly one learner when the same request arrives several times at once", async () => {
    const s = await newAnonymousSession();
    const b = body();
    const results = await Promise.all(Array.from({ length: 6 }, () => callRoute(register, { token: s.token, body: b })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body!.learnerId)).size).toBe(1);
    expect(await storedFor(s.userId)).toEqual({ learners: 1, credentials: 1, devices: 1, consents: ["account_storage"] });
  });

  it("refuses a phone profile that belongs to another learner, and stores nothing", async () => {
    const first = await newAnonymousSession();
    const second = await newAnonymousSession();
    const device = crypto.randomUUID();
    expect((await callRoute(register, { token: first.token, body: body({ deviceProfileId: device }) })).status).toBe(201);
    const res = await callRoute(register, { token: second.token, body: body({ deviceProfileId: device }) });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "device_profile_taken" });
    expect(await storedFor(second.userId)).toEqual({ learners: 0, credentials: 0, devices: 0, consents: [] });
  });

  it("leaves nothing behind when a write fails part-way through", async () => {
    const s = await newAnonymousSession();
    // An invalid consent language fails on the last insert, after the learner,
    // PIN and phone link were written in the same transaction.
    const { error } = await admin.rpc("register_learner", {
      p_auth_user: s.userId,
      p_device_profile: crypto.randomUUID(),
      p_language: "zu",
      p_avatar: "avatar-sun",
      p_nickname: null,
      p_pin_hash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
      p_consent_version: CONSENT_VERSION,
      p_consent_language: "xx",
      p_analytics: false,
    });
    expect(error).not.toBeNull();
    expect(await storedFor(s.userId)).toEqual({ learners: 0, credentials: 0, devices: 0, consents: [] });
  });

  it("refuses staff accounts, callers without a session and outdated consent, storing nothing", async () => {
    const staff = await newStaff("facilitator", await newOrg());
    const asStaff = await callRoute(register, { token: staff.token, body: body() });
    expect(asStaff.status).toBe(403);
    expect(asStaff.body).toMatchObject({ error: "not_anonymous" });
    expect(await storedFor(staff.userId)).toMatchObject({ learners: 0 });

    expect((await callRoute(register, { body: body() })).status).toBe(401);
    expect((await callRoute(register, { token: "not-a-token", body: body() })).status).toBe(401);

    const s = await newAnonymousSession();
    const outdated = await callRoute(register, { token: s.token, body: body({ consent: { version: "2000-01-01.1", language: "zu", analytics: false } }) });
    expect(outdated.status).toBe(409);
    expect(await storedFor(s.userId)).toMatchObject({ learners: 0 });
  });

  it("cannot be called by learners or visitors directly, only by the server", async () => {
    const s = await newAnonymousSession();
    const { createClient } = await import("@supabase/supabase-js");
    const asLearner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${s.token}` } },
    });
    const { error } = await asLearner.rpc("register_learner", {
      p_auth_user: s.userId,
      p_device_profile: crypto.randomUUID(),
      p_language: "zu",
      p_avatar: "avatar-sun",
      p_nickname: null,
      p_pin_hash: "scrypt$x",
      p_consent_version: CONSENT_VERSION,
      p_consent_language: "zu",
      p_analytics: false,
    });
    expect(error).not.toBeNull();
    expect(await storedFor(s.userId)).toMatchObject({ learners: 0 });
  });
});

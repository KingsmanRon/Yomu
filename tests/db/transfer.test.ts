import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, callRoute, cleanup, newAnonymousSession, newCohort, newOrg, newStaff, ok, sql, withFailingInsert, type TestStaff } from "./helpers";
import { POST as transfer } from "@/app/api/assist/transfer/route";
import { GET as me } from "@/app/api/learner/me/route";
import { POST as register } from "@/app/api/learner/register/route";
import { CONSENT_VERSION } from "@/config/app";
import { verifyPin } from "@/server/pin";

/**
 * Moving a learner to a new phone (POST /api/assist/transfer), through the
 * real route and database: one transaction, idempotent by transfer ID,
 * explicit failure states, and the old phone's sessions revoked.
 */
let org: string;
let facilitator: TestStaff;
let staleFacilitator: TestStaff;
let cohort: { id: string; code: string };

beforeAll(async () => {
  org = await newOrg();
  facilitator = await newStaff("facilitator", org);
  staleFacilitator = await newStaff("facilitator", await newOrg());
  cohort = await newCohort(org, facilitator);
  await ok(admin.from("cohort_facilitators").insert({ cohort_id: cohort.id, user_id: staleFacilitator.userId }));
});

afterAll(cleanup);

async function learnerOnOldPhone(pin = "2468") {
  const phone = await newAnonymousSession();
  const res = await callRoute(register, {
    token: phone.token,
    body: { deviceProfileId: crypto.randomUUID(), teachingLanguage: "st", avatarId: "avatar-moon", pin, consent: { version: CONSENT_VERSION, language: "st", analytics: true } },
  });
  if (res.status !== 201) throw new Error(`registration failed: ${JSON.stringify(res.body)}`);
  const learnerId = res.body!.learnerId as string;
  await admin.rpc("join_cohort", { p_learner: learnerId, p_code: cohort.code, p_share: { mastery: false, mistakes: false, tutorLogs: false }, p_version: "test", p_language: "st" });
  return { learnerId, oldPhone: phone };
}

async function newPhone() {
  const s = await newAnonymousSession();
  return { ...s, deviceProfileId: crypto.randomUUID(), transferId: crypto.randomUUID() };
}

const move = (learnerId: string, phone: Awaited<ReturnType<typeof newPhone>>, pin: { pin?: string; newPin?: string }, token = facilitator.token) =>
  callRoute(transfer, {
    token,
    body: { transferId: phone.transferId, learnerId, deviceProfileId: phone.deviceProfileId, deviceToken: phone.token, ...pin },
  });

/** What the database holds about where the learner lives. */
async function state(learnerId: string) {
  const learner = (await admin.from("learners").select("auth_user_id").eq("id", learnerId).single()).data!;
  const devices = ((await admin.from("device_profiles").select("id").eq("learner_id", learnerId)).data ?? []).map((d) => d.id as string);
  const assists = ((await admin.from("facilitator_assists").select("action").eq("learner_id", learnerId)).data ?? []).map((a) => a.action as string).sort();
  const transfers = (await admin.from("device_transfers").select("id, status, pin_reset, old_auth_user_id, new_auth_user_id").eq("learner_id", learnerId)).data ?? [];
  const cred = (await admin.from("learner_credentials").select("pin_hash, failed_attempts").eq("learner_id", learnerId).single()).data!;
  return { boundTo: learner.auth_user_id as string | null, devices, assists, transfers, cred };
}

const authUserExists = async (id: string) => (await sql("select 1 from auth.users where id = $1", [id])).length === 1;

describe("moving a learner to a new phone", () => {
  it("moves the learner, links the phone, records the move and ends the old phone's sessions together", async () => {
    const { learnerId, oldPhone } = await learnerOnOldPhone();
    const phone = await newPhone();
    const res = await move(learnerId, phone, { pin: "2468" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ transferId: phone.transferId, status: "completed", oldSessionRevoked: true, learnerId, language: "st", avatarId: "avatar-moon", analyticsConsent: true });
    expect(res.body).not.toHaveProperty("oldAuthUserId");

    const s = await state(learnerId);
    expect(s.boundTo).toBe(phone.userId);
    expect(s.devices).toContain(phone.deviceProfileId);
    expect(s.assists).toEqual(["device_transfer"]);
    expect(s.transfers).toEqual([expect.objectContaining({ id: phone.transferId, status: "completed", pin_reset: false, old_auth_user_id: oldPhone.userId })]);
    expect(s.cred.failed_attempts).toBe(0);

    // The old phone: its Auth user and sessions are gone, and it can read nothing.
    expect(await authUserExists(oldPhone.userId)).toBe(false);
    expect((await callRoute(me, { token: oldPhone.token })).status).toBe(401);
    expect((await asUser(oldPhone.token).from("learners").select("id")).data ?? []).toEqual([]);
    // The new phone works.
    const mine = await callRoute(me, { token: phone.token });
    expect(mine.status).toBe(200);
    expect((mine.body!.learner as { id: string }).id).toBe(learnerId);
  });

  it("answers a repeated request with the recorded outcome and changes nothing more", async () => {
    const { learnerId } = await learnerOnOldPhone();
    const phone = await newPhone();
    const first = await move(learnerId, phone, { pin: "2468" });
    const again = await move(learnerId, phone, { pin: "2468" });
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    const s = await state(learnerId);
    expect(s.transfers).toHaveLength(1);
    expect(s.assists).toEqual(["device_transfer"]);
    expect(s.cred.failed_attempts).toBe(0);
    // A repeat still checks the PIN, so the new phone never keeps a wrong one.
    expect((await move(learnerId, phone, { pin: "1111" })).status).toBe(403);
  });

  it("refuses to reuse a transfer ID for a different move", async () => {
    const { learnerId } = await learnerOnOldPhone();
    const phone = await newPhone();
    expect((await move(learnerId, phone, { pin: "2468" })).status).toBe(200);
    const res = await move(learnerId, { ...phone, deviceProfileId: crypto.randomUUID() }, { pin: "2468" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "transfer_id_conflict" });
    expect((await state(learnerId)).transfers).toHaveLength(1);
  });

  it("with a forgotten PIN, sets the learner's new PIN and records the reset with the move", async () => {
    const { learnerId } = await learnerOnOldPhone();
    const phone = await newPhone();
    const res = await move(learnerId, phone, { newPin: "1357" });
    expect(res.status).toBe(200);
    const s = await state(learnerId);
    expect(await verifyPin("1357", s.cred.pin_hash)).toBe(true);
    expect(s.assists).toEqual(["device_transfer", "pin_reset"]);
    expect(s.transfers).toEqual([expect.objectContaining({ pin_reset: true, status: "completed" })]);
  });

  it("changes nothing when the PIN is wrong", async () => {
    const { learnerId, oldPhone } = await learnerOnOldPhone();
    const phone = await newPhone();
    const res = await move(learnerId, phone, { pin: "1111" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "pin_wrong" });
    const s = await state(learnerId);
    expect(s).toMatchObject({ boundTo: oldPhone.userId, assists: [], transfers: [] });
    expect(s.devices).not.toContain(phone.deviceProfileId);
    expect(await authUserExists(oldPhone.userId)).toBe(true);
  });

  it("changes nothing when any part of the move fails", async () => {
    const { learnerId, oldPhone } = await learnerOnOldPhone();
    const before = await state(learnerId);
    const phone = await newPhone();
    const res = await withFailingInsert("facilitator_assists", learnerId, () => move(learnerId, phone, { newPin: "1357" }));
    expect(res.status).toBe(500);
    const after = await state(learnerId);
    expect(after.boundTo).toBe(oldPhone.userId);
    expect(after.devices).toEqual(before.devices);
    expect(after.transfers).toEqual([]);
    expect(after.cred.pin_hash).toBe(before.cred.pin_hash);
    expect(await authUserExists(oldPhone.userId)).toBe(true);
    // Once the fault is gone, the same move (same transfer ID) goes through.
    expect((await move(learnerId, phone, { newPin: "1357" })).status).toBe(200);
  });

  it("lets only one of two simultaneous moves win", async () => {
    const { learnerId } = await learnerOnOldPhone();
    const a = await newPhone();
    const b = await newPhone();
    const [ra, rb] = await Promise.all([move(learnerId, a, { pin: "2468" }), move(learnerId, b, { pin: "2468" })]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body).toMatchObject({ error: "learner_moved" });
    const winner = ra.status === 200 ? a : b;
    const s = await state(learnerId);
    expect(s.boundTo).toBe(winner.userId);
    expect(s.transfers).toHaveLength(1);
  });

  it("refuses anyone who does not run the learner's class, before any PIN attempt is counted", async () => {
    const { learnerId, oldPhone } = await learnerOnOldPhone();
    const phone = await newPhone();
    const res = await move(learnerId, phone, { pin: "2468" }, staleFacilitator.token);
    expect(res.status).toBe(403);
    const s = await state(learnerId);
    expect(s).toMatchObject({ boundTo: oldPhone.userId, transfers: [] });
    expect(s.cred.failed_attempts).toBe(0);
    expect((await move(learnerId, phone, { pin: "2468" }, oldPhone.token)).status).toBe(403);
    expect((await callRoute(transfer, { body: { transferId: phone.transferId } })).status).toBe(401);
  });

  it("refuses a new phone that is not a fresh learner session", async () => {
    const { learnerId } = await learnerOnOldPhone();
    const asStaffPhone = { ...(await newPhone()), token: facilitator.token };
    expect((await move(learnerId, asStaffPhone, { pin: "2468" })).body).toMatchObject({ error: "device_not_anonymous" });
    const other = await learnerOnOldPhone();
    const takenPhone = { ...(await newPhone()), token: other.oldPhone.token };
    const res = await move(learnerId, takenPhone, { pin: "2468" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "device_already_registered" });
  });

  it("finishes revoking the old phone later when it cannot be done at once", async () => {
    const { learnerId, oldPhone } = await learnerOnOldPhone();
    const phone = await newPhone();
    const name = `test_keep_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await sql(`create function public.${name}() returns trigger language plpgsql as $f$ begin raise exception 'injected failure'; end $f$`);
    await sql(`create trigger ${name} before delete on auth.users for each row when (old.id = '${oldPhone.userId}') execute function public.${name}()`);
    try {
      const res = await move(learnerId, phone, { pin: "2468" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "revocation_pending", oldSessionRevoked: false });
      // Already bound to the new phone: the old one can read and change nothing.
      expect((await state(learnerId)).boundTo).toBe(phone.userId);
      expect((await callRoute(me, { token: oldPhone.token })).status).toBe(403);
      expect((await asUser(oldPhone.token).from("learners").select("id")).data ?? []).toEqual([]);
    } finally {
      await sql(`drop trigger if exists ${name} on auth.users`);
      await sql(`drop function if exists public.${name}()`);
    }
    // The daily retention job completes the revocation.
    await admin.rpc("purge_expired");
    expect((await state(learnerId)).transfers).toEqual([expect.objectContaining({ status: "completed" })]);
    expect(await authUserExists(oldPhone.userId)).toBe(false);
  });

  it("recovers a learner whose move was abandoned on another phone", async () => {
    const { learnerId } = await learnerOnOldPhone();
    const abandoned = await newPhone();
    expect((await move(learnerId, abandoned, { pin: "2468" })).status).toBe(200);
    // That phone's reply never arrived and it was put away; a new move from another phone works.
    const phone = await newPhone();
    expect((await move(learnerId, phone, { pin: "2468" })).status).toBe(200);
    expect((await state(learnerId)).boundTo).toBe(phone.userId);
    expect(await authUserExists(abandoned.userId)).toBe(false);
  });
});

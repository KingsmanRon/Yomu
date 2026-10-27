import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addActivity, admin, anon, cleanup, join, must, newCohort, newLearner, newOrg, newStaff, ok, type TestLearner, type TestStaff } from "./helpers";

/**
 * Row-level security and the consent-filtered staff functions, per role:
 * learner, facilitator, organisation admin, content reviewer, anonymous
 * visitor, and the server (service role).
 */
let org: string;
let otherOrg: string;
let facilitator: TestStaff;
let otherFacilitator: TestStaff;
let orgAdmin: TestStaff;
let reviewer: TestStaff;
let cohort: { id: string; code: string };
let otherCohort: { id: string; code: string };
let sharesAll: TestLearner;
let sharesLittle: TestLearner;
let outsider: TestLearner;

beforeAll(async () => {
  org = await newOrg();
  otherOrg = await newOrg();
  facilitator = await newStaff("facilitator", org);
  otherFacilitator = await newStaff("facilitator", otherOrg);
  orgAdmin = await newStaff("org_admin", org);
  reviewer = await newStaff("content_reviewer", null);
  cohort = await newCohort(org, facilitator);
  otherCohort = await newCohort(otherOrg, otherFacilitator);
  sharesAll = await newLearner("Shares all");
  sharesLittle = await newLearner("Shares little");
  outsider = await newLearner("Not in a class");
  for (const l of [sharesAll, sharesLittle, outsider]) await addActivity(l);
  await join(sharesAll, cohort.code, { mastery: true, mistakes: true, tutorLogs: true });
  await join(sharesLittle, cohort.code, { mastery: false, mistakes: false, tutorLogs: false });
});

afterAll(cleanup);

describe("anonymous visitors", () => {
  it("can read the published curriculum", async () => {
    const lessons = await must(anon.from("lessons").select("id").limit(1));
    expect(lessons.length).toBe(1);
  });
  it("cannot read any learner data", async () => {
    for (const table of ["learners", "learning_attempts", "learner_progress", "cohort_memberships", "consent_records", "tutor_logs"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
  });
});

describe("learners", () => {
  it("read their own records and nobody else's", async () => {
    const mine = await must(sharesAll.db.from("learning_attempts").select("learner_id"));
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((r) => r.learner_id))).toEqual(new Set([sharesAll.id]));
    const others = await must(sharesAll.db.from("learners").select("id"));
    expect(others.map((r) => r.id)).toEqual([sharesAll.id]);
    const progress = await must(sharesAll.db.from("learner_progress").select("learner_id").eq("learner_id", outsider.id));
    expect(progress).toEqual([]);
  });

  it("cannot write learning records or progress directly (only the server can)", async () => {
    // Refused either with an error or by updating no rows; either way nothing changes.
    await sharesAll.db.from("learner_progress").update({ xp: 99999 }).eq("learner_id", sharesAll.id);
    const after = await must(admin.from("learner_progress").select("xp").eq("learner_id", sharesAll.id).single());
    expect(after.xp).toBe(12);
    const { error } = await sharesAll.db.from("learning_attempts").insert({ op_id: crypto.randomUUID(), learner_id: sharesAll.id });
    expect(error).not.toBeNull();
  });

  it("never read PIN hashes, which only the server can", async () => {
    const { data } = await sharesAll.db.from("learner_credentials").select("*");
    expect(data ?? []).toEqual([]);
    const { data: staffView } = await facilitator.db.from("learner_credentials").select("*");
    expect(staffView ?? []).toEqual([]);
  });

  it("cannot call the server's functions", async () => {
    for (const [fn, args] of [
      ["sync_ingest", { p_learner: sharesAll.id, p_device: crypto.randomUUID(), p_ops: [] }],
      ["delete_learner", { p_learner: outsider.id }],
      ["ai_reserve_spend", { p_day: "2026-01-01", p_estimate: 0, p_cap: 100 }],
      ["purge_expired", {}],
    ] as const) {
      const { error } = await sharesAll.db.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
    expect(await must(admin.from("learners").select("id").eq("id", outsider.id))).toHaveLength(1);
  });
});

describe("facilitators", () => {
  it("see each learner's progress only as far as they chose to share", async () => {
    const rows = await must(facilitator.db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id }));
    const all = rows.find((r: { learner_id: string }) => r.learner_id === sharesAll.id);
    const little = rows.find((r: { learner_id: string }) => r.learner_id === sharesLittle.id);
    expect(rows.find((r: { learner_id: string }) => r.learner_id === outsider.id)).toBeUndefined();
    expect(all).toMatchObject({ lessons_completed: 1, objectives_mastered: 1 });
    expect(little).toMatchObject({ lessons_completed: 1, objectives_mastered: null });
  });

  it("see mistakes and tutor questions only with the learner's consent", async () => {
    const mistakes = await must(facilitator.db.rpc("facilitator_learner_mistakes", { p_cohort: cohort.id, p_learner: sharesAll.id }));
    expect(mistakes.length).toBe(1);
    const logs = await must(facilitator.db.rpc("facilitator_learner_tutor_logs", { p_cohort: cohort.id, p_learner: sharesAll.id }));
    expect(logs.length).toBe(1);
    expect((await facilitator.db.rpc("facilitator_learner_mistakes", { p_cohort: cohort.id, p_learner: sharesLittle.id })).error).not.toBeNull();
    expect((await facilitator.db.rpc("facilitator_learner_tutor_logs", { p_cohort: cohort.id, p_learner: sharesLittle.id })).error).not.toBeNull();
  });

  it("see nothing of another organisation's class", async () => {
    expect((await otherFacilitator.db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id })).error).not.toBeNull();
    expect((await otherFacilitator.db.rpc("cohort_completion_evidence", { p_cohort: cohort.id })).error).not.toBeNull();
    const visible = await must(otherFacilitator.db.from("cohorts").select("id"));
    expect(visible.map((c) => c.id)).toEqual([otherCohort.id]);
    const members = await must(otherFacilitator.db.from("cohort_memberships").select("learner_id"));
    expect(members).toEqual([]);
  });

  it("cannot read learner tables directly", async () => {
    const attempts = await must(facilitator.db.from("learning_attempts").select("learner_id"));
    expect(attempts).toEqual([]);
  });
});

describe("organisation admins", () => {
  it("get class totals and completion evidence", async () => {
    const totals = await must(orgAdmin.db.rpc("org_cohort_summaries", { p_org: org }));
    expect(totals.find((t: { cohort_id: string }) => t.cohort_id === cohort.id)).toMatchObject({ learners: 2, lessons_completed: 2, learners_sharing_mastery: 1 });
    const evidence = await must(orgAdmin.db.rpc("cohort_completion_evidence", { p_cohort: cohort.id }));
    expect(evidence.map((e: { learner_id: string }) => e.learner_id)).toEqual([sharesAll.id]);
  });

  it("never see individual activity, mistakes or tutor questions", async () => {
    expect((await orgAdmin.db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id })).error).not.toBeNull();
    expect((await orgAdmin.db.rpc("facilitator_learner_mistakes", { p_cohort: cohort.id, p_learner: sharesAll.id })).error).not.toBeNull();
    expect((await orgAdmin.db.rpc("facilitator_learner_tutor_logs", { p_cohort: cohort.id, p_learner: sharesAll.id })).error).not.toBeNull();
    expect((await orgAdmin.db.rpc("org_cohort_summaries", { p_org: otherOrg })).error).not.toBeNull();
  });
});

describe("consent changes", () => {
  it("stopping a kind of sharing hides it from facilitators at once", async () => {
    const learner = await newLearner("Changes mind");
    await addActivity(learner);
    await join(learner, cohort.code, { mastery: true, mistakes: true, tutorLogs: true });
    expect((await must(facilitator.db.rpc("facilitator_learner_mistakes", { p_cohort: cohort.id, p_learner: learner.id }))).length).toBe(1);
    await ok(admin.rpc("update_cohort_sharing", { p_learner: learner.id, p_cohort: cohort.id, p_share: { progress: true, mastery: true, mistakes: false, tutorLogs: false }, p_version: "test", p_language: "zu" }));
    expect((await facilitator.db.rpc("facilitator_learner_mistakes", { p_cohort: cohort.id, p_learner: learner.id })).error).not.toBeNull();
    const consents = await must(admin.from("consent_records").select("scope, withdrawn_at").eq("learner_id", learner.id).eq("consent_type", "cohort_sharing").order("granted_at"));
    expect(consents).toHaveLength(2);
    expect(consents[0].withdrawn_at).not.toBeNull();
    expect(consents[1]).toMatchObject({ withdrawn_at: null, scope: { mistakes: false } });
  });

  it("leaving a class removes the learner from facilitators and organisation totals", async () => {
    const learner = await newLearner("Leaves");
    await addActivity(learner);
    await join(learner, cohort.code, { mastery: true, mistakes: false, tutorLogs: false });
    const before = await must(orgAdmin.db.rpc("org_cohort_summaries", { p_org: org }));
    await ok(admin.rpc("update_cohort_sharing", { p_learner: learner.id, p_cohort: cohort.id, p_share: { progress: false }, p_version: "test", p_language: "zu" }));
    const rows = await must(facilitator.db.rpc("facilitator_cohort_learners", { p_cohort: cohort.id }));
    expect(rows.find((r: { learner_id: string }) => r.learner_id === learner.id)).toBeUndefined();
    const after = await must(orgAdmin.db.rpc("org_cohort_summaries", { p_org: org }));
    const count = (t: { cohort_id: string; learners: number }[]) => t.find((x) => x.cohort_id === cohort.id)!.learners;
    expect(count(after)).toBe(count(before) - 1);
  });
});

describe("deletion", () => {
  it("removes every learner-owned row and logs only that a deletion happened", async () => {
    const learner = await newLearner("Deletes");
    await addActivity(learner);
    await join(learner, cohort.code, { mastery: true, mistakes: true, tutorLogs: true });
    const logBefore = (await must(admin.from("deletion_log").select("id"))).length;
    expect(await must(admin.rpc("delete_learner", { p_learner: learner.id, p_initiated_by: "learner" }))).toBe(true);
    for (const table of [
      "learner_credentials",
      "device_profiles",
      "cohort_memberships",
      "consent_records",
      "sync_operations",
      "learning_attempts",
      "lesson_completions",
      "learner_progress",
      "objective_mastery",
      "tutor_logs",
    ]) {
      expect(await must(admin.from(table).select("learner_id").eq("learner_id", learner.id)), table).toEqual([]);
    }
    const log = await must(admin.from("deletion_log").select("*").order("id", { ascending: false }).limit(1));
    expect((await must(admin.from("deletion_log").select("id"))).length).toBe(logBefore + 1);
    expect(Object.keys(log[0]).sort()).toEqual(["deleted_at", "id", "initiated_by"]);
  });
});

describe("content reviewers", () => {
  it("record reviews under their own name only", async () => {
    const asset = (await must(admin.from("content_assets").select("id").limit(1)))[0];
    expect(asset).toBeDefined();
    const ok = await reviewer.db.from("content_reviews").insert({ asset_id: asset.id, status: "native_speaker_reviewed", reviewer_role: "native_speaker", reviewer_user_id: reviewer.userId });
    expect(ok.error).toBeNull();
    const forged = await reviewer.db.from("content_reviews").insert({ asset_id: asset.id, status: "approved", reviewer_role: "native_speaker", reviewer_user_id: facilitator.userId });
    expect(forged.error).not.toBeNull();
    const notReviewer = await facilitator.db.from("content_reviews").insert({ asset_id: asset.id, status: "approved", reviewer_role: "native_speaker", reviewer_user_id: facilitator.userId });
    expect(notReviewer.error).not.toBeNull();
    await admin.from("content_reviews").delete().eq("asset_id", asset.id);
    await admin.from("content_assets").update({ review_status: "draft" }).eq("id", asset.id);
  });
});

describe("joining a class", () => {
  it("refuses unknown codes and slows down guessing", async () => {
    const learner = await newLearner("Guesses");
    for (let i = 0; i < 10; i++) expect(await must(admin.rpc("join_cohort", { p_learner: learner.id, p_code: "000000", p_share: {}, p_version: "test", p_language: "zu" }))).toEqual({ error: "not_found" });
    expect(await must(admin.rpc("join_cohort", { p_learner: learner.id, p_code: cohort.code, p_share: {}, p_version: "test", p_language: "zu" }))).toEqual({ error: "rate_limited" });
  });
});

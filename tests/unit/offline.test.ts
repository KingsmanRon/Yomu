import { describe, expect, it, vi } from "vitest";
import type { CompiledAudio } from "@/lib/content/compiled";
import { playableSource } from "@/learner/audio/player";
import { parseJoinCode } from "@/learner/joinCode";
import { openYomuDB, type StoredProfile, type YomuDB } from "@/learner/offline/db";
import { appendOp, markAllUnsynced, mergeServerOps, newOp, opsForProfile, unsyncedOps } from "@/learner/offline/oplog";
import { createProfile, deleteProfile, hashLocalPin, localPinWaitSeconds, updateProfile, verifyLocalPin } from "@/learner/offline/profiles";
import { syncProfile } from "@/learner/offline/sync";

let n = 0;
const freshDb = () => openYomuDB(`yomu-test-${++n}-${Date.now()}`);

async function twoLearnersOnOnePhone(db: YomuDB) {
  const a = await createProfile(db, { avatarId: "avatar-sun", language: "zu", pin: "1234" });
  const b = await createProfile(db, { avatarId: "avatar-moon", language: "st", pin: "5678" });
  for (let i = 0; i < 3; i++) await appendOp(db, newOp("level_change", { level: 1, reason: "learner" }, a.id));
  await appendOp(db, newOp("level_change", { level: 2, reason: "learner" }, b.id));
  return { a, b };
}

describe("a shared phone keeps each learner's activity separate", () => {
  it("reads, counts and deletes only the given profile's ops", async () => {
    const db = await freshDb();
    const { a, b } = await twoLearnersOnOnePhone(db);
    expect((await opsForProfile(db, a.id)).every((o) => o.profileId === a.id)).toBe(true);
    expect(await opsForProfile(db, a.id)).toHaveLength(3);
    expect(await unsyncedOps(db, b.id)).toHaveLength(1);
    await deleteProfile(db, a.id);
    expect(await opsForProfile(db, a.id)).toHaveLength(0);
    expect(await opsForProfile(db, b.id)).toHaveLength(1);
    expect((await db.getAll("profiles")).map((p) => p.id)).toEqual([b.id]);
  });

  it("protects each profile with its own PIN, stored only as a slow salted hash", async () => {
    const db = await freshDb();
    const { a, b } = await twoLearnersOnOnePhone(db);
    expect(await verifyLocalPin(a, "1234")).toBe(true);
    expect(await verifyLocalPin(a, "5678")).toBe(false);
    expect(await verifyLocalPin(b, "5678")).toBe(true);
    expect(JSON.stringify(a.pin)).not.toContain("1234");
    expect(a.pin!.iterations).toBeGreaterThanOrEqual(100_000);
    expect((await hashLocalPin("1234")).salt).not.toBe((await hashLocalPin("1234")).salt);
  });

  it("asks for a growing pause after repeated wrong PINs, never a lockout", () => {
    expect([1, 2, 3, 4].map(localPinWaitSeconds)).toEqual([0, 0, 0, 0]);
    expect(localPinWaitSeconds(5)).toBe(30);
    expect(localPinWaitSeconds(6)).toBe(60);
    expect(localPinWaitSeconds(50)).toBe(300);
  });
});

describe("sync", () => {
  const registered = async (db: YomuDB, p: StoredProfile) => updateProfile(db, p.id, { learnerId: "11111111-1111-4111-8111-111111111111", syncCursor: 0 });

  it("does nothing for a learner who keeps progress on the phone only", async () => {
    const db = await freshDb();
    const { a } = await twoLearnersOnOnePhone(db);
    const fetch = vi.fn();
    expect(await syncProfile(db, a, { token: async () => "t", fetch })).toEqual({ status: "guest" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only the active profile's ops, with that profile's own session, and merges the learner's other devices", async () => {
    const db = await freshDb();
    const { a, b } = await twoLearnersOnOnePhone(db);
    const profile = await registered(db, a);
    const fromOtherPhone = newOp("level_change", { level: 3, reason: "learner" }, "22222222-2222-4222-8222-222222222222");
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { ops: { id: string; profileId: string }[] };
      return new Response(JSON.stringify({ accepted: body.ops.map((o) => o.id), rejected: [], cursor: 7, ops: [fromOtherPhone] }), { status: 200 });
    });
    const out = await syncProfile(db, profile, { token: async () => "token-of-a", fetch: fetch as unknown as typeof globalThis.fetch });
    expect(out).toEqual({ status: "ok", sent: 3, received: 1, rejected: 0 });
    const [, init] = fetch.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-of-a");
    const sent = JSON.parse(init.body as string) as { deviceProfileId: string; ops: { profileId: string }[] };
    expect(sent.deviceProfileId).toBe(a.id);
    expect(sent.ops.every((o) => o.profileId === a.id)).toBe(true);
    // The other device's op now belongs to this profile on this phone; the other learner is untouched.
    expect((await opsForProfile(db, a.id)).map((o) => o.id)).toContain(fromOtherPhone.id);
    expect(await opsForProfile(db, b.id)).toHaveLength(1);
    expect(await unsyncedOps(db, a.id)).toHaveLength(0);
    expect((await db.get("profiles", a.id))!.syncCursor).toBe(7);
  });

  it("keeps ops queued when the connection fails, and sends them next time", async () => {
    const db = await freshDb();
    const { a } = await twoLearnersOnOnePhone(db);
    const profile = await registered(db, a);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await syncProfile(db, profile, { token: async () => "t", fetch: offline as unknown as typeof globalThis.fetch })).toEqual({ status: "offline" });
    expect(await unsyncedOps(db, a.id)).toHaveLength(3);
  });

  it("stores server ops idempotently (a repeated reply adds nothing)", async () => {
    const db = await freshDb();
    const { a } = await twoLearnersOnOnePhone(db);
    const op = newOp("level_change", { level: 4, reason: "learner" }, a.id);
    expect(await mergeServerOps(db, a.id, [op])).toBe(1);
    expect(await mergeServerOps(db, a.id, [op])).toBe(0);
  });

  it("a guest who registers later keeps everything learned so far: all of it is uploaded", async () => {
    const db = await freshDb();
    const { a } = await twoLearnersOnOnePhone(db);
    await mergeServerOps(db, a.id, [newOp("level_change", { level: 1, reason: "learner" }, a.id)]);
    await markAllUnsynced(db, a.id);
    expect(await unsyncedOps(db, a.id)).toHaveLength(4);
  });
});

describe("audio never falls back to another language", () => {
  const audio = (lang: "zu" | "st" | "en", srcAac?: string): CompiledAudio => ({ src: `/audio/${lang}.ogg`, srcAac, ms: 1000, bytes: 100, placeholder: false, lang });
  it("plays only audio in the expected language", () => {
    expect(playableSource(audio("zu"), "zu", { opus: true, aac: true })).toBe("/audio/zu.ogg");
    expect(playableSource(audio("en"), "zu", { opus: true, aac: true })).toBeNull();
    expect(playableSource(audio("st"), "zu", { opus: true, aac: true })).toBeNull();
    expect(playableSource(null, "st", { opus: true, aac: true })).toBeNull();
  });
  it("uses the AAC copy only where Opus cannot play, and nothing when neither can", () => {
    expect(playableSource(audio("st", "/audio/st.m4a"), "st", { opus: false, aac: true })).toBe("/audio/st.m4a");
    expect(playableSource(audio("st"), "st", { opus: false, aac: true })).toBeNull();
    expect(playableSource(audio("st", "/audio/st.m4a"), "st", { opus: false, aac: false })).toBeNull();
  });
});

describe("class join codes", () => {
  it("reads typed codes and scanned links", () => {
    expect(parseJoinCode("515063")).toBe("515063");
    expect(parseJoinCode(" 515063 ")).toBe("515063");
    expect(parseJoinCode("https://yomu.example/#/join/515063")).toBe("515063");
    expect(parseJoinCode("51506")).toBeNull();
    expect(parseJoinCode("5150631")).toBeNull();
    expect(parseJoinCode("hello")).toBeNull();
  });
});

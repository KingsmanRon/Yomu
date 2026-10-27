import { describe, expect, it, vi } from "vitest";
import type { CompiledAudio } from "@/lib/content/compiled";
import { analyticsDecision, claimOnboardingEvents, flushAnalytics, forgetAnalytics, initAnalytics, track } from "@/learner/analytics";
import { playableSource, player } from "@/learner/audio/player";
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

  it("removing a profile also removes its queued usage events and saved sign-in, and nobody else's", async () => {
    const db = await freshDb();
    const { a, b } = await twoLearnersOnOnePhone(db);
    const at = new Date().toISOString();
    for (const profileId of [a.id, a.id, b.id, null]) await db.add("analytics", { profileId, event: "lesson_start", props: {}, at });
    const storage = new Map<string, string>([
      [`yomu-auth-${a.id}`, "session a"],
      [`yomu-auth-${b.id}`, "session b"],
    ]);
    globalThis.localStorage = { removeItem: (k: string) => void storage.delete(k) } as Storage;
    try {
      await deleteProfile(db, a.id);
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    expect((await db.getAll("analytics")).map((e) => e.profileId).sort()).toEqual([b.id, null].sort());
    expect([...storage.keys()]).toEqual([`yomu-auth-${b.id}`]);
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

describe("a clip that stalls never freezes the screen", () => {
  class FakeAudio {
    static last: FakeAudio | null = null;
    preload = "";
    src = "";
    playbackRate = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    paused = false;
    constructor() {
      FakeAudio.last = this;
    }
    canPlayType() {
      return "maybe";
    }
    play() {
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {}
  }
  const clip: CompiledAudio = { src: "/audio/zu/clip.ogg", ms: 1000, bytes: 100, placeholder: true, lang: "zu" };

  it("gives up on a clip that neither ends nor fails, a little after its length", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("fetch", async () => new Response(new Blob(["x"])));
    try {
      const result = player.play({ audio: clip, expect: "zu" });
      await vi.advanceTimersByTimeAsync(8_000);
      expect(FakeAudio.last?.paused).toBe(false);
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(result).resolves.toBe("error");
      expect(FakeAudio.last?.paused).toBe(true);
      // A clip that plays normally still ends normally.
      const next = player.play({ audio: clip, expect: "zu" });
      await vi.advanceTimersByTimeAsync(500);
      FakeAudio.last?.onended?.();
      await expect(next).resolves.toBe("ended");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("lets the newest clip win when an older one finishes loading later", async () => {
    let releaseSlow: (r: Response) => void = () => {};
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("fetch", (url: string) =>
      url.includes("slow") ? new Promise<Response>((r) => (releaseSlow = r)) : Promise.resolve(new Response(new Blob(["x"]))),
    );
    try {
      const older = player.play({ audio: { ...clip, src: "/audio/zu/slow.ogg" }, expect: "zu" });
      const newer = player.play({ audio: { ...clip, src: "/audio/zu/fast.ogg" }, expect: "zu" });
      await new Promise((r) => setTimeout(r, 0));
      releaseSlow(new Response(new Blob(["y"])));
      await expect(older).resolves.toBe("stopped");
      FakeAudio.last?.onended?.();
      await expect(newer).resolves.toBe("ended");
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("usage counts leave the phone only after the learner said yes", () => {
  const now = Date.parse("2026-10-27T10:00:00Z");
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
  const profiles = [{ id: "yes", learnerId: "learner-1", analyticsConsent: true }, { id: "no", learnerId: "learner-2", analyticsConsent: false }, { id: "guest" }];

  it("sends a consenting learner's events and never those of a learner who said no", () => {
    expect(analyticsDecision({ profileId: "yes", at: hoursAgo(1) }, profiles, now)).toBe("send");
    expect(analyticsDecision({ profileId: "no", at: hoursAgo(1) }, profiles, now)).toBe("delete");
    expect(analyticsDecision({ profileId: "removed", at: hoursAgo(1) }, profiles, now)).toBe("delete");
    expect(analyticsDecision({ profileId: "yes", at: hoursAgo(24 * 8) }, profiles, now)).toBe("delete");
  });

  it("holds onboarding and guest events for a day only, in case the learner saves online and says yes", () => {
    expect(analyticsDecision({ profileId: null, at: hoursAgo(1) }, profiles, now)).toBe("keep");
    expect(analyticsDecision({ profileId: "guest", at: hoursAgo(1) }, profiles, now)).toBe("keep");
    expect(analyticsDecision({ profileId: "guest", at: hoursAgo(25) }, profiles, now)).toBe("delete");
    expect(analyticsDecision({ profileId: null, at: hoursAgo(25) }, profiles, now)).toBe("delete");
  });

  it("attributes onboarding screens to the profile created next, and forgets a profile's events", async () => {
    const db = await freshDb();
    await db.add("analytics", { profileId: null, event: "onboarding_step", props: { step: "welcome" }, at: new Date().toISOString() });
    await claimOnboardingEvents(db, "p1");
    expect((await db.getAll("analytics")).map((e) => e.profileId)).toEqual(["p1"]);
    await forgetAnalytics(db, "p1");
    expect(await db.getAll("analytics")).toHaveLength(0);
  });

  it("deletes what may not be sent even while offline", async () => {
    const db = await freshDb();
    initAnalytics(db);
    for (const id of ["yes", "no", "guest"]) await track("lesson_start", { lessonId: "l10-satp" }, id);
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await flushAnalytics(profiles);
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await db.getAll("analytics")).map((e) => e.profileId).sort()).toEqual(["guest", "yes"]);
  });
});

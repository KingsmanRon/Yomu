"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TeachingLanguage } from "@/config/app";
import type { Catalog, CompiledAppLines, CompiledClipLibrary, CompiledLine } from "@/lib/content/compiled";
import { localDateOf } from "@/lib/learning/dates";
import { deriveState } from "@/lib/learning/engine";
import type { DerivedState, Op, OpData, OpType } from "@/lib/learning/types";
import { flushAnalytics, initAnalytics, track } from "./analytics";
import { loadAppLines, loadCatalog, loadClips } from "./content";
import { accessToken, pauseOtherSessions } from "./offline/auth";
import { getMeta, openYomuDB, setMeta, type StoredProfile, type YomuDB } from "./offline/db";
import { appendOp, newOp, opsForProfile, unsyncedOps } from "./offline/oplog";
import { listProfiles, updateProfile } from "./offline/profiles";
import { syncProfile, type SyncOutcome } from "./offline/sync";

export interface SyncState {
  status: "idle" | "syncing" | "ok" | "error" | "offline";
  pending: number;
  lastAt?: string;
}

interface LearnerContextValue {
  db: YomuDB | null;
  ready: boolean;
  /** Content failed to load (first visit while offline). */
  contentError: boolean;
  profiles: StoredProfile[];
  profile: StoredProfile | null;
  lang: TeachingLanguage | null;
  catalog: Catalog | null;
  lines: CompiledAppLines | null;
  clips: CompiledClipLibrary | null;
  ops: Op[];
  derived: DerivedState | null;
  today: string;
  sync: SyncState;
  setLang: (lang: TeachingLanguage) => void;
  activate: (profile: StoredProfile) => Promise<void>;
  lock: () => void;
  refreshProfiles: () => Promise<StoredProfile[]>;
  updateActive: (patch: Partial<StoredProfile>) => Promise<StoredProfile | null>;
  record: <T extends OpType>(type: T, data: OpData<T>) => Promise<Op | null>;
  syncNow: () => Promise<SyncOutcome | null>;
  line: (id: string) => CompiledLine | null;
  clip: (id: string) => CompiledLine | null;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function useLearner(): LearnerContextValue {
  const v = useContext(LearnerContext);
  if (!v) throw new Error("useLearner outside LearnerProvider");
  return v;
}

const ACTIVE_KEY = "activeProfileId";

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<YomuDB | null>(null);
  const [ready, setReady] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [onboardingLang, setOnboardingLang] = useState<TeachingLanguage | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [lines, setLines] = useState<CompiledAppLines | null>(null);
  const [clips, setClips] = useState<CompiledClipLibrary | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [today, setToday] = useState(() => localDateOf());
  const [sync, setSync] = useState<SyncState>({ status: "idle", pending: 0 });
  const syncing = useRef(false);

  const lang: TeachingLanguage | null = profile?.language ?? onboardingLang;

  // Open storage and load the catalog once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await openYomuDB();
      initAnalytics(opened);
      const list = await listProfiles(opened);
      const activeId = await getMeta<string>(opened, ACTIVE_KEY);
      // Only one learner on this phone: no picker and no PIN at launch.
      // Several learners: always start at the picture-based profile picker.
      const active = list.length === 1 ? list[0] : list.length > 1 ? null : null;
      if (activeId && list.length === 1 && list[0].id !== activeId) await setMeta(opened, ACTIVE_KEY, list[0].id);
      let cat: Catalog | null = null;
      try {
        cat = await loadCatalog();
      } catch {
        if (!cancelled) setContentError(true);
      }
      if (cancelled) return;
      setDb(opened);
      setProfiles(list);
      setCatalog(cat);
      if (active) {
        setProfile(active);
        setOps(await opsForProfile(opened, active.id));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Language-specific spoken lines and tutor clips.
  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    Promise.all([loadAppLines(lang), loadClips(lang)])
      .then(([l, c]) => {
        if (!cancelled) {
          setLines(l);
          setClips(c);
        }
      })
      .catch(() => !cancelled && setContentError(true));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Text size for older learners' eyesight.
  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(profile?.settings.textScale ?? 1));
    document.documentElement.lang = lang === "st" ? "st" : lang === "zu" ? "zu" : "en";
  }, [profile?.settings.textScale, lang]);

  // Keep "today" right when the app stays open overnight.
  useEffect(() => {
    const update = () => setToday(localDateOf());
    document.addEventListener("visibilitychange", update);
    const t = setInterval(update, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", update);
      clearInterval(t);
    };
  }, []);

  const derived = useMemo(
    () => (catalog && profile ? deriveState(ops, catalog.meta, today) : null),
    [catalog, profile, ops, today],
  );

  const refreshProfiles = useCallback(async () => {
    if (!db) return [];
    const list = await listProfiles(db);
    setProfiles(list);
    return list;
  }, [db]);

  const activate = useCallback(
    async (p: StoredProfile) => {
      if (!db) return;
      const updated = await updateProfile(db, p.id, { lastUsedAt: new Date().toISOString() });
      await setMeta(db, ACTIVE_KEY, p.id);
      pauseOtherSessions(p.id);
      setOps(await opsForProfile(db, p.id));
      setProfile(updated);
      setOnboardingLang(null);
      await refreshProfiles();
    },
    [db, refreshProfiles],
  );

  const lock = useCallback(() => {
    setProfile(null);
    setOps([]);
    pauseOtherSessions(null);
  }, []);

  const updateActive = useCallback(
    async (patch: Partial<StoredProfile>) => {
      if (!db || !profile) return null;
      const updated = await updateProfile(db, profile.id, patch);
      setProfile(updated);
      setProfiles((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      return updated;
    },
    [db, profile],
  );

  const syncNow = useCallback(async (): Promise<SyncOutcome | null> => {
    if (!db || !profile?.learnerId || syncing.current) return null;
    syncing.current = true;
    setSync((s) => ({ ...s, status: "syncing" }));
    const id = profile.id;
    try {
      const fresh = (await listProfiles(db)).find((p) => p.id === id) ?? profile;
      const outcome = await syncProfile(db, fresh, { token: () => accessToken(id) });
      const pending = (await unsyncedOps(db, id)).length;
      if (outcome.status === "ok") {
        setOps(await opsForProfile(db, id));
        setSync({ status: "ok", pending, lastAt: new Date().toISOString() });
        if (fresh.sessionLost) setProfile(await updateProfile(db, id, { sessionLost: false }));
      } else {
        setSync({ status: outcome.status === "offline" ? "offline" : outcome.status === "error" ? "error" : "idle", pending });
        if (outcome.status === "error") void track("sync_failure", { code: outcome.code }, id);
        // The server refused this phone's session (the learner was moved to another phone).
        const lost = outcome.status === "error" && (outcome.code === "unauthenticated" || outcome.code === "not_registered");
        if (lost !== !!fresh.sessionLost) setProfile(await updateProfile(db, id, { sessionLost: lost }));
      }
      return outcome;
    } finally {
      syncing.current = false;
      void flushAnalytics(new Set(profiles.filter((p) => p.analyticsConsent).map((p) => p.id)));
    }
  }, [db, profile, profiles]);

  const record = useCallback(
    async <T extends OpType>(type: T, data: OpData<T>) => {
      if (!db || !profile) return null;
      const op = newOp(type, data, profile.id);
      await appendOp(db, op);
      setOps((list) => [...list, op]);
      setSync((s) => ({ ...s, pending: s.pending + 1 }));
      return op;
    },
    [db, profile],
  );

  // Sync when a registered learner becomes active, when connectivity returns
  // and periodically while there is unsynced work.
  useEffect(() => {
    if (!profile?.learnerId) return;
    void syncNow();
    const onOnline = () => void syncNow();
    window.addEventListener("online", onOnline);
    const t = setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 120_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.learnerId]);

  // System messages (sys.*) are shared with the tutor and live in the clip library.
  const line = useCallback((id: string) => lines?.lines[id] ?? clips?.clips[id] ?? null, [lines, clips]);
  const clip = useCallback((id: string) => clips?.clips[id] ?? null, [clips]);

  const value: LearnerContextValue = {
    db,
    ready,
    contentError,
    profiles,
    profile,
    lang,
    catalog,
    lines,
    clips,
    ops,
    derived,
    today,
    sync,
    setLang: setOnboardingLang,
    activate,
    lock,
    refreshProfiles,
    updateActive,
    record,
    syncNow,
    line,
    clip,
  };
  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

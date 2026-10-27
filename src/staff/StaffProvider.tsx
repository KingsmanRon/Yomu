"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { backendConfigured } from "@/config/app";
import { staffClient } from "./client";

export type StaffRoleName = "facilitator" | "org_admin" | "content_reviewer" | "platform_admin";
export interface StaffRole {
  role: StaffRoleName;
  organisation_id: string | null;
  display_name: string | null;
  organisations: { name: string } | null;
}

interface StaffContext {
  ready: boolean;
  session: Session | null;
  roles: StaffRole[];
  has: (role: StaffRoleName) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<StaffContext | null>(null);

export function useStaff(): StaffContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff outside StaffProvider");
  return v;
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => !backendConfigured());
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);

  const loadRoles = useCallback(async (s: Session | null) => {
    if (!s) {
      setRoles([]);
      return;
    }
    const { data } = await staffClient().from("staff_roles").select("role, organisation_id, display_name, organisations(name)").eq("user_id", s.user.id);
    setRoles((data ?? []) as unknown as StaffRole[]);
  }, []);

  useEffect(() => {
    if (!backendConfigured()) return;
    const auth = staffClient().auth;
    let cancelled = false;
    auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadRoles(data.session);
      if (!cancelled) setReady(true);
    });
    const { data: sub } = auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadRoles(s);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadRoles]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await staffClient().auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await staffClient().auth.signOut();
  }, []);

  const has = useCallback((role: StaffRoleName) => roles.some((r) => r.role === role), [roles]);

  return <Ctx.Provider value={{ ready, session, roles, has, signIn, signOut }}>{children}</Ctx.Provider>;
}

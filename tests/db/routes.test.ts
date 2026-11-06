import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callRoute, cleanup, newAnonymousSession, newOrg, newStaff, signInStaff, sql, type TestStaff } from "./helpers";
import { POST as register } from "@/app/api/learner/register/route";
import { POST as consent } from "@/app/api/learner/consent/route";
import { POST as analytics } from "@/app/api/analytics/route";
import { CLIENT_ERRORS_PER_MINUTE, POST as clientErrors } from "@/app/api/errors/route";
import { POST as tutorLab } from "@/app/api/dev/tutor-lab/route";
import { CONSENT_VERSION } from "@/config/app";

/**
 * Every API route runs with the server's service role, so each one must
 * establish who is calling, and what they may do, before it reads or changes
 * anything. This file keeps an inventory of all routes with the access rule
 * each was reviewed against (a new route fails the first test until it is
 * classified here), and checks the refusals of every class through the real
 * handlers.
 */
afterAll(cleanup);

type Handler = (request: Request) => Promise<Response>;
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type StaffRole = "facilitator" | "org_admin" | "content_reviewer" | "platform_admin";

/** Access rules: who may call each route, checked first in the handler. */
type Rule =
  | { kind: "public" } // reads nothing personal, writes nothing
  | { kind: "public-capped" } // anyone; storage capped in the database
  | { kind: "consenting-learner" } // anyone; acts only for a learner whose consent is in force
  | { kind: "cron" } // the CRON_SECRET bearer
  | { kind: "anonymous" } // a fresh anonymous Auth session (registration)
  | { kind: "learner" } // a registered learner, taken from the token
  | { kind: "staff"; roles: StaffRole[] } // staff with one of the roles, at aal2
  | { kind: "staff-session" }; // any staff member at any assurance level (MFA recovery only)

const ALL: StaffRole[] = ["facilitator", "org_admin", "content_reviewer", "platform_admin"];
const ACCESS: Record<string, Partial<Record<Method, Rule>>> = {
  "admin/pilot-metrics": { GET: { kind: "staff", roles: ["platform_admin"] } },
  "admin/staff-mfa-reset": { POST: { kind: "staff", roles: ["platform_admin"] } },
  analytics: { POST: { kind: "consenting-learner" } },
  "assist/learners": { GET: { kind: "staff", roles: ["facilitator"] } },
  "assist/pin-reset": { POST: { kind: "staff", roles: ["facilitator"] } },
  "assist/transfer": { POST: { kind: "staff", roles: ["facilitator"] } },
  "cron/purge": { GET: { kind: "cron" }, POST: { kind: "cron" } },
  "dev/tutor-lab": { POST: { kind: "staff", roles: ["platform_admin", "content_reviewer"] } },
  errors: { POST: { kind: "public-capped" } },
  health: { GET: { kind: "public" } },
  "learner/cohort/join": { POST: { kind: "learner" } },
  "learner/cohort/sharing": { POST: { kind: "learner" } },
  "learner/cohorts": { GET: { kind: "learner" } },
  "learner/consent": { POST: { kind: "learner" } },
  "learner/delete": { POST: { kind: "learner" } },
  "learner/export": { GET: { kind: "learner" } },
  "learner/me": { GET: { kind: "learner" }, PATCH: { kind: "learner" } },
  "learner/pin": { POST: { kind: "learner" } },
  "learner/register": { POST: { kind: "anonymous" } },
  "staff/evidence": { GET: { kind: "staff", roles: ["facilitator", "org_admin"] } },
  "staff/mfa/recover": { POST: { kind: "staff-session" } },
  "staff/mfa/recovery-codes": { GET: { kind: "staff", roles: ALL }, POST: { kind: "staff", roles: ALL } },
  sync: { POST: { kind: "learner" } },
  "tutor/ask": { POST: { kind: "learner" } },
  "tutor/capabilities": { GET: { kind: "public" } },
};

const modules = import.meta.glob<Record<string, unknown>>("../../src/app/api/**/route.ts");
const routes: { path: string; method: Method; rule: Rule; handler: Handler }[] = [];

beforeAll(async () => {
  for (const [file, load] of Object.entries(modules)) {
    const path = file.replace("../../src/app/api/", "").replace("/route.ts", "");
    const mod = await load();
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
      const rule = ACCESS[path]?.[method];
      if (typeof mod[method] === "function" && rule) routes.push({ path, method, rule, handler: mod[method] as Handler });
    }
  }
});

function request(path: string, method: Method, token?: string): Request {
  return new Request(`http://localhost/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : "{}",
  });
}

async function call(route: (typeof routes)[number], token?: string) {
  const res = await route.handler(request(route.path, route.method, token));
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { status: res.status, error: body?.error };
}

/** Row counts of every table a route can change, to show a refused call changed nothing. */
async function snapshot() {
  const tables = [
    "learners",
    "learner_credentials",
    "consent_records",
    "device_profiles",
    "cohort_memberships",
    "sync_operations",
    "facilitator_assists",
    "device_transfers",
    "analytics_events",
    "tutor_requests",
    "staff_mfa_recovery_codes",
    "staff_security_events",
    "join_attempts",
    "deletion_log",
  ];
  const rows = await sql<{ t: string; n: string }>(tables.map((t) => `select '${t}' as t, count(*)::text as n from public.${t}`).join(" union all "));
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

async function registeredLearner() {
  const s = await newAnonymousSession();
  const res = await callRoute(register, {
    token: s.token,
    body: { deviceProfileId: crypto.randomUUID(), teachingLanguage: "zu", avatarId: "avatar-sun", pin: "2468", consent: { version: CONSENT_VERSION, language: "zu", analytics: false } },
  });
  if (res.status !== 201) throw new Error(`registration failed: ${JSON.stringify(res.body)}`);
  return { ...s, learnerId: res.body!.learnerId as string };
}

describe("API routes", () => {
  it("are all classified with a reviewed access rule", () => {
    const found = Object.keys(modules)
      .map((f) => f.replace("../../src/app/api/", "").replace("/route.ts", ""))
      .sort();
    expect(found).toEqual(Object.keys(ACCESS).sort());
    for (const path of found) {
      const exported = Object.keys(ACCESS[path]).sort();
      expect(routes.filter((r) => r.path === path).map((r) => r.method).sort(), path).toEqual(exported);
    }
  });

  it("that need a sign-in refuse missing and invalid tokens, changing nothing", async () => {
    const before = await snapshot();
    const guarded = routes.filter((r) => ["anonymous", "learner", "staff", "staff-session", "cron"].includes(r.rule.kind));
    expect(guarded.length).toBeGreaterThan(15);
    for (const route of guarded) {
      for (const token of [undefined, "not-a-token", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl"]) {
        const res = await call(route, token);
        expect([route.path, route.method, token, res.status]).toEqual([route.path, route.method, token, route.rule.kind === "cron" && !process.env.CRON_SECRET ? 503 : 401]);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("for learners refuse staff and anonymous sessions that are not a registered learner", async () => {
    const staff = await newStaff("facilitator", await newOrg());
    const anonymous = await newAnonymousSession();
    const before = await snapshot();
    for (const route of routes.filter((r) => r.rule.kind === "learner")) {
      for (const token of [staff.token, anonymous.token]) {
        const res = await call(route, token);
        expect([route.path, route.method, res.status, res.error]).toEqual([route.path, route.method, 403, "not_registered"]);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("for staff refuse learners, staff without the role, and staff without the second step", async () => {
    const org = await newOrg();
    const learner = await registeredLearner();
    const staff: Record<StaffRole, TestStaff> = {
      facilitator: await newStaff("facilitator", org),
      org_admin: await newStaff("org_admin", org),
      content_reviewer: await newStaff("content_reviewer", null),
      platform_admin: await newStaff("platform_admin", null),
    };
    const before = await snapshot();
    for (const route of routes.filter((r) => r.rule.kind === "staff" || r.rule.kind === "staff-session")) {
      const allowed = route.rule.kind === "staff" ? route.rule.roles : ALL;
      expect([route.path, (await call(route, learner.token)).status]).toEqual([route.path, 403]);
      for (const role of ALL) {
        if (allowed.includes(role)) {
          if (route.rule.kind === "staff") {
            const passwordOnly = await signInStaff(staff[role], { mfa: false });
            expect([route.path, role, (await call(route, passwordOnly.token)).error]).toEqual([route.path, role, "mfa_required"]);
          }
          continue;
        }
        const res = await call(route, staff[role].token);
        expect([route.path, role, res.status, res.error]).toEqual([route.path, role, 403, "forbidden"]);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("registration accepts only an anonymous session", async () => {
    const staff = await newStaff("content_reviewer", null);
    const res = await callRoute(register, {
      token: staff.token,
      body: { deviceProfileId: crypto.randomUUID(), teachingLanguage: "zu", avatarId: "avatar-sun", pin: "2468", consent: { version: CONSENT_VERSION, language: "zu", analytics: false } },
    });
    expect([res.status, res.body?.error]).toEqual([403, "not_anonymous"]);
  });

  it("the retention job needs the exact secret", async () => {
    const route = routes.find((r) => r.path === "cron/purge" && r.method === "POST")!;
    const secret = process.env.CRON_SECRET;
    if (!secret) return expect((await call(route)).status).toBe(503);
    const learner = await registeredLearner();
    for (const token of [`${secret.slice(0, -1)}${secret.endsWith("x") ? "y" : "x"}`, secret.slice(1), learner.token]) expect((await call(route, token)).status).toBe(401);
  });

  it("the developer tutor lab lets only platform administrators and content reviewers in", async () => {
    const lab = (token?: string) => {
      const form = new FormData();
      form.set("lang", "zu");
      form.set("lessonId", "l00-hl-vowels");
      form.set("stepId", "s01");
      form.set("audio", new Blob(["what does this mean"], { type: "text/plain" }), "question");
      return tutorLab(new Request("http://localhost/api/dev/tutor-lab", { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} }));
    };
    const learner = await registeredLearner();
    const facilitator = await newStaff("facilitator", await newOrg());
    const reviewer = await newStaff("content_reviewer", null);
    expect((await lab()).status).toBe(401);
    expect((await lab(learner.token)).status).toBe(403);
    expect((await lab(facilitator.token)).status).toBe(403);
    expect(((await (await lab((await signInStaff(reviewer, { mfa: false })).token)).json()) as { error: string }).error).toBe("mfa_required");
    expect([401, 403]).not.toContain((await lab(reviewer.token)).status);
  });

  it("client error reports are scrubbed and capped per minute for all callers together", async () => {
    const recent = async () =>
      Number(
        (await sql<{ n: string }>("select count(*)::text as n from public.error_logs where created_at > now() - interval '1 minute' and context ->> 'kind' = 'client'"))[0].n,
      );
    const before = await recent();
    const report = { errors: Array.from({ length: 20 }, (_, i) => ({ message: `routes-test ${i} for someone@example.com`, context: { screen: "home", secret: "x" } })) };
    let recorded = 0;
    for (let i = 0; i < 3; i++) {
      const res = await callRoute(clientErrors, { body: report });
      expect(res.status).toBe(200);
      recorded += res.body!.recorded as number;
    }
    expect(recorded).toBe(Math.max(0, CLIENT_ERRORS_PER_MINUTE - before));
    expect(await recent()).toBeLessThanOrEqual(Math.max(CLIENT_ERRORS_PER_MINUTE, before));
    const stored = await sql<{ message: string; context: Record<string, unknown> }>("select message, context from public.error_logs where message like 'routes-test%' limit 1");
    if (stored.length > 0) {
      expect(stored[0].message).toContain("[email]");
      expect(stored[0].context).toEqual({ screen: "home", kind: "client" });
    }
    await sql("delete from public.error_logs where message like 'routes-test%'");
  });

  it("usage counts are stored only for a learner whose consent is in force", async () => {
    const learner = await registeredLearner();
    const events = { events: [{ event: "lesson_start", props: { lessonId: "l00-hl-vowels" } }] };
    const count = async () => Number((await sql<{ n: string }>("select count(*)::text as n from public.analytics_events e join public.learners l on l.pseudonym = e.pseudonym where l.id = $1", [learner.learnerId]))[0].n);
    expect((await callRoute(analytics, { body: events })).body?.recorded).toBe(0);
    expect((await callRoute(analytics, { token: learner.token, body: events })).body?.recorded).toBe(0);
    await callRoute(consent, { token: learner.token, body: { type: "analytics", granted: true, version: CONSENT_VERSION, language: "zu" } });
    expect((await callRoute(analytics, { token: learner.token, body: events })).body?.recorded).toBe(1);
    await callRoute(consent, { token: learner.token, body: { type: "analytics", granted: false, version: CONSENT_VERSION, language: "zu" } });
    expect((await callRoute(analytics, { token: learner.token, body: events })).body?.recorded).toBe(0);
    expect(await count()).toBe(1);
    const staff = await newStaff("platform_admin", null);
    expect((await callRoute(analytics, { token: staff.token, body: events })).body?.recorded).toBe(0);
  });
});

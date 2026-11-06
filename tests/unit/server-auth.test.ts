import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));

/**
 * The app reads 401 as "this phone's session is gone" (the learner was moved
 * to another phone, or the account was deleted) and then offers to remove
 * the learner's copy from the phone. An Auth outage must therefore never be
 * reported as 401.
 */
describe("checking the caller's session", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_unit_test");
  });
  const request = () => new Request("http://localhost/api/sync", { headers: { Authorization: "Bearer some-token" } });

  it("answers 503 when Auth cannot be reached or fails", async () => {
    const { userFromRequest } = await import("@/server/supabase");
    for (const error of [{ status: 0, name: "AuthRetryableFetchError" }, { name: "AuthRetryableFetchError" }, { status: 502 }, { status: 500 }]) {
      getUser.mockResolvedValueOnce({ data: { user: null }, error });
      await expect(userFromRequest(request())).rejects.toMatchObject({ status: 503, code: "auth_unavailable" });
    }
  });

  it("answers 401 when Auth says the session or token is not valid", async () => {
    const { userFromRequest } = await import("@/server/supabase");
    for (const error of [{ status: 400, name: "AuthSessionMissingError" }, { status: 403, code: "bad_jwt" }, { status: 401 }]) {
      getUser.mockResolvedValueOnce({ data: { user: null }, error });
      await expect(userFromRequest(request())).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    }
  });
});

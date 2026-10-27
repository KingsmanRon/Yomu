import { accessToken } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Calls the app's own API with the profile's session. Throws ApiError with a stable code. */
export async function api<T>(
  profileId: string | null,
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const token = init.token !== undefined ? init.token : profileId ? await accessToken(profileId) : null;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (!res.ok) {
    let code = "server_error";
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // Not JSON.
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

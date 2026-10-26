import "server-only";
import { ZodError } from "zod";
import { HttpError } from "./supabase";
import { logServerError } from "./observability";

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) } });
}

/**
 * Wraps a route handler: maps known errors to JSON responses with stable
 * error codes the app can turn into spoken, translated messages.
 */
export function handler<A extends unknown[]>(fn: (request: Request, ...rest: A) => Promise<Response>) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    try {
      return await fn(request, ...rest);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, { status: e.status });
      if (e instanceof ZodError) return json({ error: "invalid_request", issues: e.issues.slice(0, 10) }, { status: 400 });
      await logServerError(e, { path: new URL(request.url).pathname });
      return json({ error: "server_error" }, { status: 500 });
    }
  };
}

export async function readJson(request: Request, maxBytes = 512_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

import { backendReady } from "@/server/env";
import { json } from "@/server/http";

/** Liveness check; also tells the app whether online features are configured. */
export function GET() {
  return json({ ok: true, backend: backendReady(), build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" });
}

import "server-only";

/** Developer tools (the tutor lab) exist outside production only, unless explicitly enabled. */
export function devToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEV_TOOLS_ENABLED === "true";
}

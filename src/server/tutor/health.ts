import "server-only";

/**
 * A small circuit breaker per provider, in this server process. After
 * repeated failures a provider is treated as unhealthy for a while, so
 * learners get the "tutor is resting" clip immediately instead of waiting
 * for timeouts, and the tutor falls back to Tier 1.
 */
const FAILURES_TO_OPEN = 3;
const OPEN_MS = 5 * 60_000;

interface State {
  consecutiveFailures: number;
  openUntil: number;
}

const states = new Map<string, State>();

function state(provider: string): State {
  let s = states.get(provider);
  if (!s) {
    s = { consecutiveFailures: 0, openUntil: 0 };
    states.set(provider, s);
  }
  return s;
}

export function isHealthy(provider: string, now = Date.now()): boolean {
  return state(provider).openUntil <= now;
}

export function recordSuccess(provider: string): void {
  const s = state(provider);
  s.consecutiveFailures = 0;
  s.openUntil = 0;
}

export function recordFailure(provider: string, now = Date.now()): void {
  const s = state(provider);
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= FAILURES_TO_OPEN) s.openUntil = now + OPEN_MS;
}

/** For tests. */
export function resetHealth(): void {
  states.clear();
}

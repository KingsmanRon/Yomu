"use client";

import { useSyncExternalStore } from "react";

/**
 * Hash router for the learner app. The whole learner experience is one page
 * so it can run fully offline from the service worker cache; the hash keeps
 * the current screen across refreshes (resume).
 */
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function current(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/";
}

export function useRoute(): { path: string; parts: string[] } {
  const path = useSyncExternalStore(subscribe, current, () => "/");
  return { path, parts: path.split("/").filter(Boolean) };
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const url = `${window.location.pathname}${window.location.search}#${path}`;
  if (opts.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function back(fallback = "/home"): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}

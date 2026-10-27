"use client";

import { useSyncExternalStore } from "react";

/**
 * Connectivity and data-cost awareness. Android Chrome reports whether the
 * connection is Wi-Fi or mobile data (Network Information API); elsewhere the
 * type is "unknown" and the app treats downloads as possibly costing data.
 */
export type ConnectionKind = "offline" | "wifi" | "mobile" | "unknown";

interface NetworkInformationLike extends EventTarget {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
}

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

export function currentConnection(): ConnectionKind {
  if (typeof navigator === "undefined") return "unknown";
  if (!navigator.onLine) return "offline";
  const c = connection();
  if (!c?.type) return "unknown";
  if (c.type === "wifi" || c.type === "ethernet") return "wifi";
  if (c.type === "cellular") return "mobile";
  if (c.type === "none") return "offline";
  return "unknown";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  const c = connection();
  c?.addEventListener("change", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
    c?.removeEventListener("change", callback);
  };
}

export function useConnection(): ConnectionKind {
  return useSyncExternalStore(subscribe, currentConnection, () => "unknown");
}

export function useOnline(): boolean {
  return useConnection() !== "offline";
}

export function saveDataRequested(): boolean {
  return !!connection()?.saveData;
}

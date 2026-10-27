import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The proposed AET outcome descriptors (content/aet/outcomes.json). Every
 * export that shows them also shows their review status and the disclaimer:
 * the mapping is not accredited until an accredited AET specialist reviews it.
 */
export interface AetOutcome {
  id: string;
  level: string;
  learningArea: string;
  outcome: string;
  officialReference: string | null;
  status: "proposed_unreviewed" | "specialist_reviewed";
}

let cached: { disclaimer: string; outcomes: Map<string, AetOutcome> } | null = null;

export function aetOutcomes(): { disclaimer: string; outcomes: Map<string, AetOutcome> } {
  if (!cached) {
    const file = JSON.parse(readFileSync(join(process.cwd(), "content", "aet", "outcomes.json"), "utf8")) as { disclaimer: string; outcomes: AetOutcome[] };
    cached = { disclaimer: file.disclaimer, outcomes: new Map(file.outcomes.map((o) => [o.id, o])) };
  }
  return cached;
}

export function aetStatusText(o: AetOutcome | undefined): string {
  if (!o) return "proposed mapping, not accredited";
  return o.status === "specialist_reviewed" && o.officialReference ? `reviewed by an AET specialist (${o.officialReference})` : "proposed mapping, not accredited";
}

/**
 * Capability gating for the AI tutor. Pure functions over the provider
 * capability matrix (config/capabilities.json).
 *
 * The one rule: a capability is used with learners only when its matrix
 * entry is `verified`, records who verified it and when, and is explicitly
 * marked `learnerVisible`. Anything else is invisible to learners and the
 * tutor falls back to the next lower tier. Tier 1 (validated recorded clips)
 * needs no provider and is always available, online or offline.
 */
export type Capability = "stt" | "tts" | "translation" | "pronunciation_scoring" | "llm_dialogue";
export type CapabilityStatus = "verified" | "experimental" | "unsupported";
export type MatrixLanguage = "zu" | "st" | "en";

export interface CapabilityEntry {
  provider: string;
  language: MatrixLanguage;
  capability: Capability;
  status: CapabilityStatus;
  verifiedAt: string | null;
  verifierRole: string | null;
  learnerVisible: boolean;
  notes: string;
}

export interface CapabilityMatrix {
  version: string;
  entries: CapabilityEntry[];
}

export function findEntry(
  matrix: CapabilityMatrix,
  provider: string,
  language: MatrixLanguage,
  capability: Capability,
): CapabilityEntry | undefined {
  return matrix.entries.find((e) => e.provider === provider && e.language === language && e.capability === capability);
}

export function learnerCanUse(
  matrix: CapabilityMatrix,
  provider: string | undefined,
  language: MatrixLanguage,
  capability: Capability,
): boolean {
  if (!provider) return false;
  const e = findEntry(matrix, provider, language, capability);
  return (
    !!e && e.status === "verified" && e.learnerVisible === true && !!e.verifiedAt && !!e.verifierRole
  );
}

/** Problems that make a matrix unsafe to ship. Checked in CI and at load time. */
export function matrixProblems(matrix: CapabilityMatrix): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of matrix.entries) {
    const key = `${e.provider}/${e.language}/${e.capability}`;
    if (seen.has(key)) problems.push(`duplicate entry ${key}`);
    seen.add(key);
    if (e.learnerVisible && e.status !== "verified") problems.push(`${key} is learnerVisible but not verified`);
    if (e.status === "verified" && (!e.verifiedAt || !e.verifierRole))
      problems.push(`${key} is verified without a date and verifier role`);
    if (!e.notes || e.notes.trim().length < 10) problems.push(`${key} has no evaluation notes`);
  }
  return problems;
}

/** Which provider is configured for each capability (from server environment). */
export interface ProviderSelection {
  stt?: string;
  llm?: string;
  tts?: string;
}

export interface TutorTiers {
  /** Highest available tier. */
  tier: 1 | 2 | 3;
  /** Tier 2: ask a question aloud, answered with the best validated clip. */
  spokenQuestions: boolean;
  /** Tier 3: generated explanations spoken by a verified voice. */
  generatedSpeech: boolean;
  /** Plain-language reasons for anything unavailable (shown to developers and facilitators). */
  reasons: string[];
}

export function tutorTiers(
  matrix: CapabilityMatrix,
  language: "zu" | "st",
  selection: ProviderSelection,
  healthy: (provider: string) => boolean,
  online: boolean,
): TutorTiers {
  const reasons: string[] = [];
  if (!online) reasons.push("offline: only validated recorded clips are available");

  const usable = (provider: string | undefined, capability: Capability, label: string) => {
    if (!provider) {
      reasons.push(`no ${label} provider configured`);
      return false;
    }
    if (!learnerCanUse(matrix, provider, language, capability)) {
      reasons.push(`${provider} ${label} for '${language}' is not verified for learners`);
      return false;
    }
    if (!healthy(provider)) {
      reasons.push(`${provider} is failing; temporarily disabled`);
      return false;
    }
    return true;
  };

  const stt = usable(selection.stt, "stt", "speech-to-text");
  const llm = usable(selection.llm, "llm_dialogue", "language model");
  const tts = usable(selection.tts, "tts", "text-to-speech");

  const spokenQuestions = online && stt && llm;
  const generatedSpeech = online && llm && tts;
  return {
    tier: generatedSpeech ? 3 : spokenQuestions ? 2 : 1,
    spokenQuestions,
    generatedSpeech,
    reasons,
  };
}

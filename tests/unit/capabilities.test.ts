import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  learnerCanUse,
  matrixProblems,
  tutorTiers,
  type CapabilityEntry,
  type CapabilityMatrix,
} from "@/lib/capabilities/tiers";

const shipped = JSON.parse(readFileSync("config/capabilities.json", "utf8")) as CapabilityMatrix;

const entry = (over: Partial<CapabilityEntry>): CapabilityEntry => ({
  provider: "p",
  language: "zu",
  capability: "stt",
  status: "verified",
  verifiedAt: "2026-10-01",
  verifierRole: "native_speaker",
  learnerVisible: true,
  notes: "evaluated with 12 speakers",
  ...over,
});

const healthy = () => true;

describe("shipped capability matrix", () => {
  it("has no integrity problems", () => {
    expect(matrixProblems(shipped)).toEqual([]);
  });

  it("exposes nothing to learners that is not verified", () => {
    for (const e of shipped.entries) {
      if (e.status !== "verified") expect(learnerCanUse(shipped, e.provider, e.language, e.capability)).toBe(false);
    }
  });

  it("gives learners Tier 1 only in both languages with the providers currently integrated", () => {
    for (const language of ["zu", "st"] as const) {
      const tiers = tutorTiers(
        shipped,
        language,
        { stt: "lelapa-vulavula", llm: "anthropic-claude", tts: "device-web-speech" },
        healthy,
        true,
      );
      expect(tiers.tier).toBe(1);
      expect(tiers.spokenQuestions).toBe(false);
      expect(tiers.generatedSpeech).toBe(false);
    }
  });

  it("never lets the development adapter reach learners", () => {
    for (const language of ["zu", "st"] as const) {
      expect(tutorTiers(shipped, language, { stt: "dev-adapter", llm: "dev-adapter", tts: "dev-adapter" }, healthy, true).tier).toBe(1);
    }
  });
});

describe("capability gate", () => {
  it("requires status verified, a verifier and learnerVisible", () => {
    const m = (e: CapabilityEntry): CapabilityMatrix => ({ version: "t", entries: [e] });
    expect(learnerCanUse(m(entry({})), "p", "zu", "stt")).toBe(true);
    expect(learnerCanUse(m(entry({ status: "experimental" })), "p", "zu", "stt")).toBe(false);
    expect(learnerCanUse(m(entry({ learnerVisible: false })), "p", "zu", "stt")).toBe(false);
    expect(learnerCanUse(m(entry({ verifiedAt: null })), "p", "zu", "stt")).toBe(false);
    expect(learnerCanUse(m(entry({ verifierRole: null })), "p", "zu", "stt")).toBe(false);
    // Verified for isiZulu says nothing about Sesotho.
    expect(learnerCanUse(m(entry({})), "p", "st", "stt")).toBe(false);
  });

  it("flags matrices that would expose unverified capabilities", () => {
    const bad: CapabilityMatrix = { version: "t", entries: [entry({ status: "experimental", learnerVisible: true })] };
    expect(matrixProblems(bad)).toContain("p/zu/stt is learnerVisible but not verified");
  });

  it("selects the highest verified tier and degrades when offline or failing", () => {
    const matrix: CapabilityMatrix = {
      version: "t",
      entries: [
        entry({ provider: "s", capability: "stt" }),
        entry({ provider: "l", capability: "llm_dialogue" }),
        entry({ provider: "v", capability: "tts" }),
      ],
    };
    const sel = { stt: "s", llm: "l", tts: "v" };
    expect(tutorTiers(matrix, "zu", sel, healthy, true).tier).toBe(3);
    expect(tutorTiers(matrix, "zu", { ...sel, tts: undefined }, healthy, true).tier).toBe(2);
    expect(tutorTiers(matrix, "zu", sel, (p) => p !== "s", true)).toMatchObject({ tier: 3, spokenQuestions: false });
    expect(tutorTiers(matrix, "zu", sel, (p) => p !== "l", true).tier).toBe(1);
    expect(tutorTiers(matrix, "zu", sel, healthy, false).tier).toBe(1);
    expect(tutorTiers(matrix, "st", sel, healthy, true).tier).toBe(1);
  });
});

/**
 * What a spoken question to the tutor (Tier 2) can be classified as. The
 * first six are the same help a learner can choose by tapping (Tier 1), so a
 * spoken question is answered with exactly the same validated recordings and
 * the same honesty rule (help that reveals a reading answer marks the attempt
 * as supported). Nothing generated is ever played to the learner in Tier 2.
 */
export const HELP_INTENTS = ["replay", "how", "slow", "hear", "letter", "meaning"] as const;
export const TUTOR_INTENTS = [...HELP_INTENTS, "off_topic", "unknown"] as const;

export type HelpIntent = (typeof HELP_INTENTS)[number];
export type TutorIntent = (typeof TUTOR_INTENTS)[number];

export function isHelpIntent(i: string): i is HelpIntent {
  return (HELP_INTENTS as readonly string[]).includes(i);
}

/** Plain descriptions of each intent, used to instruct the classifier and in the developer lab. */
export const INTENT_DESCRIPTIONS: Record<TutorIntent, string> = {
  replay: "The learner wants the instruction or explanation said again.",
  how: "The learner asks how this exercise works or what they must do.",
  slow: "The learner wants to hear the word or sentence again, more slowly.",
  hear: "The learner wants to hear how the word they are looking at sounds (says it, reads it aloud for them).",
  letter: "The learner asks about the sound of a letter, or the first sound of the word.",
  meaning: "The learner asks what the word means in their own language.",
  off_topic: "The question is not about this English reading or writing lesson (for example money, health, news, personal matters).",
  unknown: "The question is about the lesson but is none of the above, or it is unclear what is asked.",
};

/** Server reply to a spoken question. */
export type TutorAskResult =
  | { outcome: "intent"; intent: TutorIntent }
  /**
   * Tier 3: a generated explanation, spoken by a voice verified for this
   * language. Only possible when the capability matrix verifies both the
   * language model and the voice; it reveals content, so it always marks the
   * current attempt as supported.
   */
  | { outcome: "speech"; audio: string; mime: string }
  /** Spending cap, rate limit or provider failure: the learner hears "the tutor is resting" and keeps using tap-to-help. */
  | { outcome: "resting"; reason: "rate_limited" | "spend_cap" | "provider_error" }
  /** Spoken questions are not verified for this language: the app should not have offered them. */
  | { outcome: "unavailable" };

/** The validated clip played for outcomes that are not help options. */
export function clipForResult(r: TutorAskResult): string | null {
  if (r.outcome === "speech") return null;
  if (r.outcome === "resting") return "tutor.resting";
  if (r.outcome === "unavailable") return "tutor.resting";
  if (r.intent === "off_topic") return "tutor.off_topic";
  if (r.intent === "unknown") return "tutor.cant_answer_yet";
  return null;
}

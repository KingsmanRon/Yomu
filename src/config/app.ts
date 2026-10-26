/**
 * Product-wide configuration.
 *
 * The product name is defined here and nowhere else. "Yomu" is the current
 * name ("Funda English" was the working name in the original brief). A
 * trademark and name-conflict check is required before any public launch:
 * see docs/known-limitations.md.
 */
export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME || "Yomu";

export const TEACHING_LANGUAGES = ["zu", "st"] as const;
export type TeachingLanguage = (typeof TEACHING_LANGUAGES)[number];

/** Languages that can carry content: the two teaching languages plus English (target). */
export type ContentLanguage = TeachingLanguage | "en";

export interface LanguageConfig {
  code: TeachingLanguage;
  /** BCP 47 tag used for `lang` attributes and provider requests. */
  bcp47: string;
  /** How the language names itself; shown on the language selection screen. */
  nativeName: string;
  englishName: string;
  /**
   * Orthography of all content in this language. Stored explicitly so that a
   * variant (for example Lesotho Sesotho, which writes "lijo" for "dijo") can
   * be added later as a separate configuration rather than mixed in.
   */
  orthography: {
    id: string;
    description: string;
  };
}

export const LANGUAGE_CONFIG: Record<TeachingLanguage, LanguageConfig> = {
  zu: {
    code: "zu",
    bcp47: "zu-ZA",
    nativeName: "isiZulu",
    englishName: "isiZulu",
    orthography: {
      id: "zu-ZA-standard",
      description: "Standard South African isiZulu orthography.",
    },
  },
  st: {
    code: "st",
    bcp47: "st-ZA",
    nativeName: "Sesotho",
    englishName: "Sesotho (South Africa)",
    orthography: {
      id: "st-ZA",
      description:
        "South African Sesotho orthography (for example 'dijo', 'kgomo', 'tjhelete', 'o' for 'you'), not the Lesotho orthography ('lijo', 'khomo', 'chelete', 'u').",
    },
  },
};

export function isTeachingLanguage(value: unknown): value is TeachingLanguage {
  return value === "zu" || value === "st";
}

/** Version of the spoken consent scripts. Bump whenever the consent text changes. */
export const CONSENT_VERSION = "2026-10-26.1";

/** Version of the placement / pre-post assessment instrument. */
export const ASSESSMENT_INSTRUMENT_VERSION = "placement-v1";

/**
 * Show the amber "unreviewed content" marker on content that is not yet
 * `approved`. On by default because all current language content is draft.
 */
export const SHOW_REVIEW_MARKERS: boolean = process.env.NEXT_PUBLIC_SHOW_REVIEW_MARKERS !== "false";

/** Client-side analytics switch. The server has its own switch (ANALYTICS_ENABLED). */
export const CLIENT_ANALYTICS_ENABLED: boolean = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false";

export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/** Supabase connection details that are safe to expose to the browser. */
export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_PUBLISHABLE_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export function backendConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
}

import { tutorTiers } from "@/lib/capabilities/tiers";
import { handler, json } from "@/server/http";
import { providerSelection } from "@/server/providers";
import { isHealthy } from "@/server/tutor/health";
import { loadMatrix } from "@/server/tutor/matrix";
import { HttpError } from "@/server/supabase";

/**
 * Which tutor tiers learners may use for a language right now. Tier 2 and 3
 * are only ever reported when the capability matrix verifies every provider
 * involved and those providers are healthy.
 */
export const GET = handler(async (request) => {
  const lang = new URL(request.url).searchParams.get("lang");
  if (lang !== "zu" && lang !== "st") throw new HttpError(400, "invalid_language");
  const { matrix } = loadMatrix();
  const tiers = tutorTiers(matrix, lang, providerSelection(), isHealthy, true);
  return json({
    tier: tiers.tier,
    spokenQuestions: tiers.spokenQuestions,
    generatedSpeech: tiers.generatedSpeech,
    matrixVersion: matrix.version,
    // Reasons are for developers; they name providers, so production omits them.
    ...(process.env.NODE_ENV !== "production" ? { reasons: tiers.reasons } : {}),
  });
});

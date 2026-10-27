import { z } from "zod";
import { handler, json } from "@/server/http";
import { metricsCsv, pilotMetrics, MIN_GROUP } from "@/server/metrics";
import { requireStaff } from "@/server/supabase";

/**
 * Anonymised pilot measures for platform administrators (see
 * docs/pilot-measurement-plan.md). Aggregates only; groups smaller than
 * MIN_GROUP are suppressed. `?cohort=<id>` (repeatable) limits the figures to
 * active members of those classes.
 */
const CohortIds = z.array(z.uuid()).max(50);

export const GET = handler(async (request) => {
  await requireStaff(request, ["platform_admin"]);
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "csv" ? "csv" : "json";
  const cohorts = CohortIds.parse(params.getAll("cohort"));
  const today = new Date().toISOString().slice(0, 10);
  const rows = await pilotMetrics(today, cohorts);
  if (format === "csv") {
    return new Response(metricsCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pilot-metrics-${today}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return json({ generatedOn: today, minimumGroupSize: MIN_GROUP, cohorts, rows });
});

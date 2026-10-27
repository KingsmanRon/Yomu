import { handler, json } from "@/server/http";
import { metricsCsv, pilotMetrics, MIN_GROUP } from "@/server/metrics";
import { requireStaff } from "@/server/supabase";

/**
 * Anonymised pilot measures for platform administrators (see
 * docs/pilot-measurement-plan.md). Aggregates only; groups smaller than
 * MIN_GROUP are suppressed.
 */
export const GET = handler(async (request) => {
  await requireStaff(request, ["platform_admin"]);
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const today = new Date().toISOString().slice(0, 10);
  const rows = await pilotMetrics(today);
  if (format === "csv") {
    return new Response(metricsCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pilot-metrics-${today}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return json({ generatedOn: today, minimumGroupSize: MIN_GROUP, rows });
});

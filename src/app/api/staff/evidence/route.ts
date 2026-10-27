import { z } from "zod";
import { loadCatalog } from "@/server/catalog";
import { evidenceCsv, evidencePdf, type AssessmentRow, type EvidenceRow } from "@/server/evidence";
import { handler } from "@/server/http";
import { HttpError, supabaseAsUser, userFromRequest } from "@/server/supabase";

const Query = z.object({ cohort: z.uuid(), format: z.enum(["csv", "pdf"]) });

/**
 * Completion evidence for a class, as CSV or a printable PDF. Runs as the
 * signed-in staff member: the database functions allow only the class's
 * facilitators and its organisation's admins, and include only learners who
 * consented to share mastery.
 */
export const GET = handler(async (request) => {
  const { token } = await userFromRequest(request);
  const url = new URL(request.url);
  const q = Query.parse({ cohort: url.searchParams.get("cohort"), format: url.searchParams.get("format") });
  const db = supabaseAsUser(token);
  const [cohort, evidence, assessments] = await Promise.all([
    db.from("cohorts").select("name, join_code, organisations(name)").eq("id", q.cohort).maybeSingle(),
    db.rpc("cohort_completion_evidence", { p_cohort: q.cohort }),
    db.rpc("cohort_assessment_evidence", { p_cohort: q.cohort }),
  ]);
  if (evidence.error || assessments.error || !cohort.data) throw new HttpError(403, "forbidden", "Only this class's facilitators and organisation admins can export its evidence.");
  const catalog = loadCatalog();
  const name = `completion-evidence-${cohort.data.join_code}-${new Date().toISOString().slice(0, 10)}`;
  if (q.format === "csv") {
    return new Response(evidenceCsv(evidence.data as EvidenceRow[], catalog), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
    });
  }
  const pdf = await evidencePdf({
    cohortName: cohort.data.name,
    organisationName: (cohort.data.organisations as unknown as { name: string } | null)?.name ?? "",
    rows: evidence.data as EvidenceRow[],
    assessments: assessments.data as AssessmentRow[],
    catalog,
    generatedAt: new Date(),
  });
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store" },
  });
});

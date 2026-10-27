"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { downloadWithToken, staffClient } from "./client";
import { useStaff } from "./StaffProvider";
import { AET_NOTICE, BackLink, Button, Card, Notice, Table } from "./ui";

interface Summary {
  cohort_id: string;
  cohort_name: string;
  created_at: string;
  archived: boolean;
  learners: number;
  learners_sharing_progress: number;
  active_last_7_days: number;
  lessons_completed: number;
  learners_sharing_mastery: number;
  objectives_mastered: number;
}

/**
 * Organisation admins: totals per class, never individual learners'
 * activity, mistakes or tutor questions. Completion evidence covers only
 * learners who chose to share mastery.
 */
export function OrgPage() {
  const org = useSearchParams().get("org") ?? "";
  const { roles } = useStaff();
  const name = roles.find((r) => r.organisation_id === org)?.organisations?.name ?? "Organisation";
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    staffClient()
      .rpc("org_cohort_summaries", { p_org: org })
      .then(({ data, error: e }) => {
        if (e) setError("Only this organisation's administrators can see these reports.");
        setRows((data ?? []) as Summary[]);
      });
  }, [org]);

  const download = (cohort: string, format: "csv" | "pdf") =>
    downloadWithToken(`/api/staff/evidence?cohort=${cohort}&format=${format}`, `completion-evidence.${format}`).catch((e: Error) => setError(e.message));

  const total = (k: keyof Summary) => (rows ?? []).reduce((n, r) => n + (r[k] as number), 0);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/staff">Staff home</BackLink>
      <h1 className="text-2xl font-bold">{name}</h1>
      {error && <Notice tone="error">{error}</Notice>}
      <Card title="Classes" testId="org-summary">
        <Table
          testId="org-table"
          empty={rows === null ? "Loading…" : "No classes yet."}
          head={["Class", "Learners", "Sharing progress", "Active in the last 7 days", "Lessons completed", "Sharing mastery", "Objectives mastered", "Evidence"]}
          rows={(rows ?? []).map((r) => [
            `${r.cohort_name}${r.archived ? " (archived)" : ""}`,
            r.learners,
            r.learners_sharing_progress,
            r.active_last_7_days,
            r.lessons_completed,
            r.learners_sharing_mastery,
            r.objectives_mastered,
            <span key="e" className="flex gap-1">
              <Button variant="secondary" onClick={() => void download(r.cohort_id, "csv")}>
                CSV
              </Button>
              <Button variant="secondary" onClick={() => void download(r.cohort_id, "pdf")}>
                PDF
              </Button>
            </span>,
          ])}
        />
        {rows && rows.length > 1 && (
          <p className="text-sm font-semibold">
            All classes: {total("learners")} learners, {total("lessons_completed")} lessons completed by learners who share progress, {total("objectives_mastered")} objectives mastered by learners who share mastery.
          </p>
        )}
        <p className="text-sm text-ink-soft">
          Counts include only what learners chose to share. Learners can stop sharing at any time, which removes them from these totals immediately. AI tutor
          questions are never included in organisation reports.
        </p>
        <Notice tone="warn">{AET_NOTICE}</Notice>
      </Card>
    </div>
  );
}

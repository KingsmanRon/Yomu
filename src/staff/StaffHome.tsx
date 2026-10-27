"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { downloadWithToken, staffClient } from "./client";
import { useStaff } from "./StaffProvider";
import { Badge, Button, Card, Field, Notice, Table, inputClass } from "./ui";

interface Cohort {
  id: string;
  name: string;
  join_code: string;
  join_open: boolean;
  created_at: string;
  archived_at: string | null;
  organisation_id: string;
}

/** Staff start page: what each role can do, in one place. */
export function StaffHome() {
  const { roles, has } = useStaff();
  const router = useRouter();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgs = roles.filter((r) => r.organisation_id && (r.role === "facilitator" || r.role === "org_admin"));
  const uniqueOrgs = [...new Map(orgs.map((r) => [r.organisation_id!, r.organisations?.name ?? "Organisation"])).entries()];
  const [orgId, setOrgId] = useState(uniqueOrgs[0]?.[0] ?? "");
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;
    staffClient()
      .from("cohorts")
      .select("id, name, join_code, join_open, created_at, archived_at, organisation_id")
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) setError(e.message);
        setCohorts((data ?? []) as Cohort[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { data, error: err } = await staffClient().rpc("create_cohort", { p_org: orgId || uniqueOrgs[0]?.[0], p_name: name.trim() });
    if (err) {
      setError(err.message);
      return;
    }
    router.push(`/staff/class/${(data as Cohort).id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Welcome</h1>
      {error && <Notice tone="error">{error}</Notice>}

      {(has("facilitator") || has("org_admin")) && (
        <Card title="Classes" testId="classes">
          <Table
            testId="class-list"
            empty={cohorts === null ? "Loading…" : "No classes yet."}
            head={["Class", "Join code", "Joining", "Created"]}
            rows={(cohorts ?? []).map((c) => [
              <Link key="n" href={`/staff/class/${c.id}`} className="font-semibold text-primary underline-offset-2 hover:underline" data-testid={`class-link-${c.join_code}`}>
                {c.name}
              </Link>,
              <span key="c" className="font-mono text-base tracking-widest">
                {c.join_code}
              </span>,
              c.archived_at ? <Badge key="j">archived</Badge> : c.join_open ? <Badge key="j" tone="good">open</Badge> : <Badge key="j">closed</Badge>,
              new Date(c.created_at).toLocaleDateString(),
            ])}
          />
          {uniqueOrgs.length > 0 && (
            <form onSubmit={(e) => void create(e)} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
              {uniqueOrgs.length > 1 && (
                <Field label="Organisation">
                  <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={inputClass}>
                    {uniqueOrgs.map(([id, n]) => (
                      <option key={id} value={id}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="New class name">
                <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required className={inputClass} data-testid="new-class-name" />
              </Field>
              <Button type="submit" data-testid="create-class">
                Create class
              </Button>
            </form>
          )}
        </Card>
      )}

      {has("org_admin") && (
        <Card title="Organisation reports">
          <p className="text-sm text-ink-soft">Totals per class (no individual learners) and completion evidence for learners who chose to share it.</p>
          <div className="flex flex-wrap gap-2">
            {roles
              .filter((r) => r.role === "org_admin" && r.organisation_id)
              .map((r) => (
                <Link key={r.organisation_id} href={`/staff/org?org=${r.organisation_id}`} className="rounded-xl border border-line px-4 py-2 font-semibold text-primary" data-testid="org-link">
                  {r.organisations?.name ?? "Organisation"}
                </Link>
              ))}
          </div>
        </Card>
      )}

      {(has("content_reviewer") || has("platform_admin")) && (
        <Card title="Content review">
          <p className="text-sm text-ink-soft">Listen to and review every spoken line, its text and translation. Decisions go to the content files with `npm run content:pull-reviews`.</p>
          <Link href="/staff/review" className="w-fit rounded-xl bg-primary px-4 py-2 font-semibold text-white" data-testid="review-link">
            Open the review tool
          </Link>
        </Card>
      )}

      {has("platform_admin") && <PilotMetrics />}
    </div>
  );
}

function PilotMetrics() {
  const [error, setError] = useState<string | null>(null);
  const get = (format: "csv" | "json") =>
    downloadWithToken(`/api/admin/pilot-metrics?format=${format}`, `pilot-metrics-${new Date().toISOString().slice(0, 10)}.${format}`).catch((e: Error) => setError(e.message));
  return (
    <Card title="Pilot measurement">
      <p className="text-sm text-ink-soft">Anonymised, aggregated measures for the pilot (no names, pseudonyms or learner IDs; groups smaller than 5 are suppressed).</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => void get("csv")} data-testid="metrics-csv">
          Download CSV
        </Button>
        <Button variant="secondary" onClick={() => void get("json")}>
          Download JSON
        </Button>
      </div>
    </Card>
  );
}

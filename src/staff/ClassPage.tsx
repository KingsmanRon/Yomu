"use client";

import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import type { Catalog } from "@/lib/content/compiled";
import { downloadWithToken, staffClient } from "./client";
import { useStaff } from "./StaffProvider";
import { AET_NOTICE, AiUnverified, BackLink, Badge, Button, Card, Notice, Table } from "./ui";

interface Cohort {
  id: string;
  name: string;
  join_code: string;
  join_open: boolean;
  encouragement_enabled: boolean;
  archived_at: string | null;
  organisation_id: string;
}
interface LearnerRow {
  learner_id: string;
  avatar_id: string;
  nickname: string | null;
  joined_at: string;
  share_progress: boolean;
  share_mastery: boolean;
  share_mistakes: boolean;
  share_tutor_logs: boolean;
  current_level: number | null;
  lessons_completed: number | null;
  last_active_date: string | null;
  objectives_mastered: number | null;
}
interface ObjectiveRow {
  objective_id: string;
  learners_attempted: number;
  learners_with_errors: number;
  incorrect_attempts: number;
  total_attempts: number;
}

const notShared = <span className="text-ink-soft">not shared</span>;

const ITEM_KIND: Record<string, string> = { l: "letter", syl: "syllable", w: "word", sw: "sight word", ph: "phrase", sen: "sentence", psg: "passage" };
/** "zu.w.umama" becomes "umama (word)". */
export function itemLabel(id: string): string {
  const [, kind, ...rest] = id.split(".");
  return rest.length > 0 && ITEM_KIND[kind] ? `${rest.join(".")} (${ITEM_KIND[kind]})` : id;
}

/** One class: joining, learners (only what each learner chose to share), common difficulties and evidence. */
export function ClassPage() {
  const { id } = useParams<{ id: string }>();
  const { has } = useStaff();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [learners, setLearners] = useState<LearnerRow[] | null>(null);
  const [learnersError, setLearnersError] = useState<string | null>(null);
  const [objectives, setObjectives] = useState<ObjectiveRow[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [selected, setSelected] = useState<LearnerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = staffClient();
    db.from("cohorts")
      .select("id, name, join_code, join_open, encouragement_enabled, archived_at, organisation_id")
      .eq("id", id)
      .maybeSingle()
      .then(async ({ data, error: e }) => {
        if (cancelled) return;
        if (e || !data) {
          setError(e?.message ?? "Class not found, or you do not have access to it.");
          return;
        }
        setCohort(data as Cohort);
        const [l, o] = await Promise.all([db.rpc("facilitator_cohort_learners", { p_cohort: id }), db.rpc("cohort_objective_summary", { p_cohort: id })]);
        if (cancelled) return;
        if (l.error) setLearnersError("Learner details are visible to this class's facilitators only.");
        setLearners((l.data ?? []) as LearnerRow[]);
        setObjectives((o.data ?? []) as ObjectiveRow[]);
      });
    fetch("/content/catalog.json")
      .then((r) => r.json())
      .then((c: Catalog) => !cancelled && setCatalog(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const joinUrl = cohort ? `${window.location.origin}/#/join/${cohort.join_code}` : "";
  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setQr, () => setQr(null));
  }, [joinUrl]);

  const objectiveText = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of catalog?.lessons ?? []) for (const o of l.objectives) map.set(o.id, o.description);
    return map;
  }, [catalog]);
  const lessonTitle = useMemo(() => new Map((catalog?.lessons ?? []).map((l) => [l.id, l.title.en])), [catalog]);

  const update = async (patch: Partial<Pick<Cohort, "join_open" | "encouragement_enabled" | "archived_at">>) => {
    // Row-level security turns a refused update into "0 rows", not an error: check that it happened.
    const { data, error: e } = await staffClient().from("cohorts").update(patch).eq("id", id).select("id");
    if (e || !data || data.length === 0) setError(e?.message ?? "The change was not saved: you may not have permission to change this class.");
    else setCohort((c) => (c ? { ...c, ...patch } : c));
  };

  const download = (format: "csv" | "pdf") =>
    downloadWithToken(`/api/staff/evidence?cohort=${id}&format=${format}`, `completion-evidence-${cohort?.join_code}.${format}`).catch((e: Error) => setError(e.message));

  if (error && !cohort) return <Notice tone="error">{error}</Notice>;
  if (!cohort) return <p className="text-ink-soft">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/staff">All classes</BackLink>
      <h1 className="text-2xl font-bold" data-testid="class-name">
        {cohort.name}
      </h1>
      {error && <Notice tone="error">{error}</Notice>}

      <Card title="Joining" testId="joining">
        <div className="flex flex-wrap items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={`QR code to join ${cohort.name}`} className="h-44 w-44 rounded-lg border border-line" data-testid="join-qr" />}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-soft">Learners tap the class picture in the app, then type this code or scan the QR code.</span>
            <span className="font-mono text-4xl font-bold tracking-[0.3em]" data-testid="join-code">
              {cohort.join_code}
            </span>
            <div className="flex flex-wrap gap-2">
              {cohort.join_open ? <Badge tone="good">Joining is open</Badge> : <Badge>Joining is closed</Badge>}
              {cohort.encouragement_enabled ? <Badge tone="info">Class encouragement on</Badge> : <Badge>Class encouragement off</Badge>}
            </div>
          </div>
        </div>
        {!cohort.archived_at && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void update({ join_open: !cohort.join_open })} data-testid="toggle-joining">
              {cohort.join_open ? "Close joining" : "Open joining"}
            </Button>
            <Button variant="secondary" onClick={() => void update({ encouragement_enabled: !cohort.encouragement_enabled })} data-testid="toggle-encouragement">
              {cohort.encouragement_enabled ? "Turn off class encouragement" : "Turn on class encouragement"}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Class encouragement shows learners a positive class total (lessons finished this week) when at least 3 learners share progress. There are no rankings or
          individual comparisons.
        </p>
      </Card>

      <Card title={`Learners (${learners?.length ?? 0})`} testId="learners">
        {learnersError ? (
          <Notice tone="info">{learnersError}</Notice>
        ) : (
          <Table
            testId="learner-table"
            empty={learners === null ? "Loading…" : "No learners have joined yet."}
            head={["Learner", "Level", "Lessons", "Last active", "Objectives mastered", "Shares", ""]}
            rows={(learners ?? []).map((l) => [
              <span key="n" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/images/${l.avatar_id}.svg`} alt="" className="h-9 w-9" />
                <span className="font-semibold">{l.nickname ?? "(no nickname)"}</span>
              </span>,
              l.share_progress ? (l.current_level ?? "–") : notShared,
              l.share_progress ? (l.lessons_completed ?? 0) : notShared,
              l.share_progress ? (l.last_active_date ?? "–") : notShared,
              l.share_mastery ? (l.objectives_mastered ?? 0) : notShared,
              <span key="s" className="flex flex-wrap gap-1">
                {l.share_progress && <Badge>progress</Badge>}
                {l.share_mastery && <Badge>mastery</Badge>}
                {l.share_mistakes && <Badge>mistakes</Badge>}
                {l.share_tutor_logs && <Badge>tutor questions</Badge>}
              </span>,
              l.share_mistakes || l.share_tutor_logs ? (
                <Button key="d" variant="secondary" onClick={() => setSelected(l)} data-testid={`learner-detail-${l.avatar_id}`}>
                  Details
                </Button>
              ) : (
                ""
              ),
            ])}
          />
        )}
        <p className="text-sm text-ink-soft">
          Learners choose what to share when they join, and can change or stop it at any time; changes apply immediately. To help a learner with a forgotten PIN or
          a new phone, open the app on their phone and tap the teacher picture.
        </p>
      </Card>

      {selected && <LearnerDetail cohortId={id} learner={selected} lessonTitle={lessonTitle} onClose={() => setSelected(null)} />}

      <Card title="Where the class needs practice" testId="objective-summary">
        <Table
          empty={objectives === null ? "Loading…" : "Not enough activity yet. Objectives appear once at least 3 learners who share progress have tried them."}
          head={["Objective", "Learners who tried", "Learners with mistakes", "Wrong first tries"]}
          rows={(objectives ?? []).map((o) => [
            objectiveText.get(o.objective_id) ?? o.objective_id,
            o.learners_attempted,
            o.learners_with_errors,
            `${o.incorrect_attempts} of ${o.total_attempts}`,
          ])}
        />
      </Card>

      <Card
        title="Completion evidence"
        actions={
          <>
            <Button variant="secondary" onClick={() => void download("csv")} data-testid="evidence-csv">
              Download CSV
            </Button>
            <Button variant="secondary" onClick={() => void download("pdf")} data-testid="evidence-pdf">
              Download PDF
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Objectives mastered, with dates and the kind of evidence, for learners who chose to share mastery.</p>
        <Notice tone="warn">{AET_NOTICE}</Notice>
      </Card>

      {has("org_admin") && !cohort.archived_at && (
        <Button variant="danger" className="w-fit" onClick={() => void update({ archived_at: new Date().toISOString(), join_open: false })}>
          Archive this class
        </Button>
      )}
    </div>
  );
}

function LearnerDetail({ cohortId, learner, lessonTitle, onClose }: { cohortId: string; learner: LearnerRow; lessonTitle: Map<string, string>; onClose: () => void }) {
  const [mistakes, setMistakes] = useState<{ occurred_at: string; lesson_id: string; exercise_type: string; item_id: string; error_type: string | null }[] | null>(null);
  const [logs, setLogs] = useState<{ created_at: string; tier: number; request_text: string | null; response_text: string | null; clip_id: string | null; generated: boolean }[] | null>(null);
  useEffect(() => {
    const db = staffClient();
    if (learner.share_mistakes) db.rpc("facilitator_learner_mistakes", { p_cohort: cohortId, p_learner: learner.learner_id }).then(({ data }) => setMistakes(data ?? []));
    if (learner.share_tutor_logs) db.rpc("facilitator_learner_tutor_logs", { p_cohort: cohortId, p_learner: learner.learner_id }).then(({ data }) => setLogs(data ?? []));
  }, [cohortId, learner]);
  return (
    <Card title={`${learner.nickname ?? "Learner"}: details they chose to share`} actions={<Button variant="secondary" onClick={onClose}>Close</Button>} testId="learner-detail">
      {learner.share_mistakes && (
        <>
          <h3 className="font-semibold">Recent mistakes</h3>
          <Table
            empty={mistakes === null ? "Loading…" : "No mistakes recorded."}
            head={["When", "Lesson", "Exercise", "Item", "Kind of mistake"]}
            rows={(mistakes ?? []).map((m) => [
              new Date(m.occurred_at).toLocaleString(),
              lessonTitle.get(m.lesson_id) ?? m.lesson_id,
              m.exercise_type.replace(/_/g, " "),
              itemLabel(m.item_id),
              m.error_type ? m.error_type.replace(/_/g, " ") : "–",
            ])}
          />
        </>
      )}
      {learner.share_tutor_logs && (
        <>
          <h3 className="font-semibold">Questions asked to the tutor</h3>
          <Table
            empty={logs === null ? "Loading…" : "No questions recorded."}
            head={["When", "Question (transcribed)", "Answer"]}
            rows={(logs ?? []).map((t) => [
              new Date(t.created_at).toLocaleString(),
              t.request_text ?? "",
              t.generated ? (
                <span key="a" className="flex flex-col gap-1">
                  <AiUnverified />
                  {t.response_text}
                </span>
              ) : (
                (t.clip_id ?? "recorded help")
              ),
            ])}
          />
          <p className="text-sm text-ink-soft">Questions are transcribed automatically and may contain errors. They are deleted automatically after the retention period.</p>
        </>
      )}
    </Card>
  );
}

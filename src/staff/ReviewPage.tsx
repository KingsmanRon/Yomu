"use client";

import { useEffect, useState, type FormEvent } from "react";
import { staffClient } from "./client";
import { useStaff } from "./StaffProvider";
import { BackLink, Badge, Button, Card, Field, Notice, inputClass } from "./ui";

type Status = "draft" | "native_speaker_reviewed" | "educator_reviewed" | "approved";
interface Asset {
  id: string;
  kind: string;
  language: "zu" | "st" | "en";
  text: string;
  context_note: string | null;
  usage: string;
  lesson_id: string | null;
  review_status: Status;
  audio_url: string | null;
  audio_placeholder: boolean;
}
interface Review {
  status: Status;
  reviewer_role: string;
  notes: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  native_speaker_reviewed: "Native speaker reviewed",
  educator_reviewed: "Educator reviewed",
  approved: "Approved",
};
const ROLES = [
  ["native_speaker", "Native speaker"],
  ["adult_literacy_educator", "Adult literacy educator"],
  ["linguist", "Linguist"],
  ["aet_specialist", "AET specialist"],
  ["voice_director", "Voice director"],
] as const;
const PAGE = 25;

/**
 * Content review: every spoken line (script text, translation and audio),
 * reviewed in order: native speaker, then adult-literacy educator, then
 * approval. Decisions are stored with the reviewer's role and the date only,
 * and reach the content files with `npm run content:pull-reviews`.
 */
export function ReviewPage() {
  const { has } = useStaff();
  const [lang, setLang] = useState<"" | "zu" | "st" | "en">("zu");
  const [status, setStatus] = useState<"" | Status>("draft");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown at page level: a reviewed line may leave the filtered list straight away.
  const [recorded, setRecorded] = useState<string | null>(null);

  // Bumped after a decision so the list shows the new status.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let q = staffClient()
      .from("content_assets")
      .select("id, kind, language, text, context_note, usage, lesson_id, review_status, audio_url, audio_placeholder", { count: "exact" })
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (lang) q = q.eq("language", lang);
    if (status) q = q.eq("review_status", status);
    if (kind) q = q.eq("kind", kind);
    const term = search.trim().replace(/[%,()]/g, " ");
    if (term) q = q.or(`text.ilike.%${term}%,id.ilike.%${term}%`);
    q.then(({ data, error: e, count: c }) => {
      if (cancelled) return;
      if (e) setError(e.message);
      setAssets((data ?? []) as Asset[]);
      setCount(c ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [lang, status, kind, search, page, version]);

  if (!has("content_reviewer") && !has("platform_admin")) return <Notice tone="warn">The review tool is for content reviewers.</Notice>;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/staff">Staff home</BackLink>
      <h1 className="text-2xl font-bold">Content review</h1>
      <Notice tone="info">
        Check that each line sounds natural and respectful for adults, uses the right orthography (South African Sesotho, for example &quot;dijo&quot;), matches the
        lesson, and that its audio (when recorded) matches the text exactly. Placeholder audio is a tone, not speech.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {recorded && <Notice tone="info">{recorded}</Notice>}
      <Card>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Language">
            <select value={lang} onChange={(e) => (setPage(0), setLang(e.target.value as typeof lang))} className={inputClass} data-testid="review-lang">
              <option value="">All</option>
              <option value="zu">isiZulu</option>
              <option value="st">Sesotho</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => (setPage(0), setStatus(e.target.value as typeof status))} className={inputClass} data-testid="review-status">
              <option value="">All</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kind">
            <select value={kind} onChange={(e) => (setPage(0), setKind(e.target.value))} className={inputClass}>
              <option value="">All</option>
              {["teaching", "instruction", "feedback", "tutor", "app", "model_audio", "gloss", "assessment", "title"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search text or ID">
            <input value={search} onChange={(e) => (setPage(0), setSearch(e.target.value))} className={inputClass} data-testid="review-search" />
          </Field>
        </div>
        <p className="text-sm text-ink-soft" data-testid="review-count">
          {count} line{count === 1 ? "" : "s"}
        </p>
      </Card>
      {(assets ?? []).map((a) => (
        <AssetCard key={a.id} asset={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} onReviewed={(message) => {
            setRecorded(message);
            setOpen(null);
            setVersion((v) => v + 1);
          }} />
      ))}
      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span className="text-sm">
          Page {page + 1} of {Math.max(1, Math.ceil(count / PAGE))}
        </span>
        <Button variant="secondary" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function AssetCard({ asset, open, onToggle, onReviewed }: { asset: Asset; open: boolean; onToggle: () => void; onReviewed: (message: string) => void }) {
  const { session, has } = useStaff();
  const [history, setHistory] = useState<Review[] | null>(null);
  const [decision, setDecision] = useState<Status>(asset.review_status === "draft" ? "native_speaker_reviewed" : asset.review_status === "native_speaker_reviewed" ? "educator_reviewed" : "approved");
  const [role, setRole] = useState<string>(asset.review_status === "draft" ? "native_speaker" : "adult_literacy_educator");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    staffClient()
      .from("content_reviews")
      .select("status, reviewer_role, notes, created_at")
      .eq("asset_id", asset.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setHistory((data ?? []) as Review[]));
  }, [open, asset.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: err } = await staffClient()
      .from("content_reviews")
      .insert({ asset_id: asset.id, status: decision, reviewer_role: role, notes: notes.trim() || null, reviewer_user_id: session?.user.id });
    if (err) {
      setError(err.message);
      return;
    }
    setNotes("");
    onReviewed(`Recorded for ${asset.id}: ${STATUS_LABEL[decision]} (${role.replace(/_/g, " ")}).`);
  };

  return (
    <Card testId={`asset-${asset.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-ink-soft">{asset.id}</span>
          <p className="text-lg" lang={asset.language}>
            {asset.text}
          </p>
          {asset.context_note && <p className="text-sm text-ink-soft">Note for the voice: {asset.context_note}</p>}
          <p className="text-xs text-ink-soft">
            {asset.kind} · {asset.usage}
            {asset.lesson_id ? ` · ${asset.lesson_id}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={asset.review_status === "approved" ? "good" : asset.review_status === "draft" ? "warn" : "info"}>{STATUS_LABEL[asset.review_status]}</Badge>
          {asset.audio_placeholder && <Badge>placeholder audio</Badge>}
        </div>
      </div>
      {asset.audio_url && <audio controls preload="none" src={asset.audio_url} className="w-full" />}
      <Button variant="secondary" className="w-fit" onClick={onToggle} data-testid="review-open">
        {open ? "Close" : "Review"}
      </Button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {history && history.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {history.map((h, i) => (
                <li key={i}>
                  {new Date(h.created_at).toLocaleDateString()}: {STATUS_LABEL[h.status]} ({h.reviewer_role.replace(/_/g, " ")}){h.notes ? `: ${h.notes}` : ""}
                </li>
              ))}
            </ul>
          )}
          {has("content_reviewer") ? (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Decision">
                  <select value={decision} onChange={(e) => setDecision(e.target.value as Status)} className={inputClass} data-testid="review-decision">
                    <option value="native_speaker_reviewed">Native speaker: correct and natural</option>
                    <option value="educator_reviewed">Educator: suitable for adult learners</option>
                    <option value="approved">Approved for use</option>
                    <option value="draft">Needs changes (back to draft)</option>
                  </select>
                </Field>
                <Field label="Your role">
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} data-testid="review-role">
                    {ROLES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Notes (what to change, or why it is fine)">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} className={`${inputClass} py-2`} data-testid="review-notes" />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" className="w-fit" data-testid="review-submit">
                Record decision
              </Button>
            </form>
          ) : (
            <Notice tone="info">Only content reviewers can record decisions.</Notice>
          )}
        </div>
      )}
    </Card>
  );
}

import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck2,
  FilePlus2,
  History,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  useCreateExecutiveGovernanceReview,
  useFinalizeExecutiveGovernanceReview,
  useGovernanceAssuranceCadence,
  useGovernanceAssuranceDistributions,
  useGovernanceAssuranceSignoffs,
  useSaveGovernanceAssuranceCadence,
  useUpdateExecutiveGovernanceReview,
} from "@/hooks/use-governance-assurance";
import { arabicNumber } from "@/lib/format";
import { ExecutiveGovernanceAssuranceHistory } from "@/components/portfolio/ExecutiveGovernanceAssuranceHistory";
import { ExecutiveGovernanceAssuranceSignoff } from "@/components/portfolio/ExecutiveGovernanceAssuranceSignoff";
import { ExecutiveGovernanceAssuranceDistribution } from "@/components/portfolio/ExecutiveGovernanceAssuranceDistribution";
import { ExecutiveGovernanceAssuranceArchiveVault } from "@/components/portfolio/ExecutiveGovernanceAssuranceArchiveVault";
import { ExecutiveGovernanceAssuranceFindings } from "@/components/portfolio/ExecutiveGovernanceAssuranceFindings";
import { ExecutiveGovernanceAssuranceRemediationAnalytics } from "@/components/portfolio/ExecutiveGovernanceAssuranceRemediationAnalytics";
import { ExecutiveGovernanceAssuranceRecurrenceRadar } from "@/components/portfolio/ExecutiveGovernanceAssuranceRecurrenceRadar";
import { downloadGovernanceAssuranceReviewCsv } from "@/services/governance-assurance.service";
import { buildExecutiveGovernanceTrends } from "@/services/governance-trends.service";
import { evaluateExecutiveGovernanceTargets } from "@/services/governance-targets.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type { ExecutiveGovernanceExceptionsData } from "@/types/governance-exceptions";
import type {
  ExecutiveGovernanceReview,
  ExecutiveGovernanceReviewsData,
  GovernanceAssuranceCadenceStatus,
  GovernanceAssuranceConclusion,
  GovernanceAssuranceEvidenceItem,
  GovernanceAssuranceDistribution,
  GovernanceAssuranceEvidenceType,
  GovernanceAssuranceSignoff,
} from "@/types/governance-assurance";
import type { ExecutiveGovernanceTargetsData } from "@/types/governance-targets";

const CONCLUSION_META: Record<
  GovernanceAssuranceConclusion,
  { label: string; className: string }
> = {
  satisfactory: {
    label: "Satisfactory",
    className: "bg-success/10 text-success",
  },
  needs_improvement: {
    label: "Needs Improvement",
    className: "bg-warning/10 text-warning",
  },
  unsatisfactory: {
    label: "Unsatisfactory",
    className: "bg-danger/10 text-danger",
  },
  insufficient_evidence: {
    label: "Insufficient Evidence",
    className: "bg-info/10 text-info",
  },
};

const CADENCE_META: Record<
  GovernanceAssuranceCadenceStatus,
  { label: string; className: string }
> = {
  no_cadence: {
    label: "No Cadence",
    className: "bg-muted text-muted-foreground",
  },
  disabled: {
    label: "Disabled",
    className: "bg-muted text-muted-foreground",
  },
  on_schedule: {
    label: "On Schedule",
    className: "bg-success/10 text-success",
  },
  due_soon: {
    label: "Due Soon",
    className: "bg-warning/10 text-warning",
  },
  overdue: {
    label: "Overdue",
    className: "bg-danger/10 text-danger",
  },
};

const EVIDENCE_LABELS: Record<GovernanceAssuranceEvidenceType, string> = {
  note: "Note",
  reference: "Reference",
  url: "URL",
};

const METRIC_LABELS: Record<string, string> = {
  decision_resolution: "Decision Resolution",
  deferred_rate: "Deferred Rate",
  action_completion: "Action Completion",
  overdue_open: "Overdue Open Rate",
  unowned_open: "Unowned Open Rate",
  on_time_completion: "On-time Completion",
  median_completion_days: "Median Completion Days",
  repeated_deferrals: "Repeated Deferrals",
};

const ASSURANCE_PRINT_STYLE = [
  "@media print {",
  "  body[data-print-mode='governance-assurance'] * { visibility: hidden !important; }",
  "  body[data-print-mode='governance-assurance'] [data-governance-assurance-print],",
  "  body[data-print-mode='governance-assurance'] [data-governance-assurance-print] * { visibility: visible !important; }",
  "  body[data-print-mode='governance-assurance'] [data-governance-assurance-print] {",
  "    position: absolute !important;",
  "    inset: 0 auto auto 0 !important;",
  "    width: 100% !important;",
  "    margin: 0 !important;",
  "    border: 0 !important;",
  "    border-radius: 0 !important;",
  "    box-shadow: none !important;",
  "    background: white !important;",
  "    color: black !important;",
  "    print-color-adjust: exact;",
  "    -webkit-print-color-adjust: exact;",
  "  }",
  "  body[data-print-mode='governance-assurance'] [data-assurance-screen-only] { display: none !important; }",
  "  body[data-print-mode='governance-assurance'] .assurance-avoid-break { break-inside: avoid; }",
  "  body[data-print-mode='governance-assurance'] .assurance-page-break { break-before: page; }",
  "  @page { size: A4 landscape; margin: 10mm; }",
  "}",
].join("\n");

interface ReviewDraft {
  id?: string;
  expected_version?: number;
  period_label: string;
  review_date: string;
  assurance_conclusion: GovernanceAssuranceConclusion | "";
  summary: string;
  management_response: string;
  evidence_snapshot: GovernanceAssuranceEvidenceItem[];
}

interface CadenceDraft {
  review_interval_days: string;
  warning_days_before: string;
  first_due_date: string;
  is_enabled: boolean;
}

interface EvidenceDraft {
  type: GovernanceAssuranceEvidenceType;
  title: string;
  reference: string;
  note: string;
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function optionalInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(
    value.length === 10 ? value + "T12:00:00Z" : value,
  );
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  }).format(date);
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
  }).format(new Date(value));
}

function formatMetricValue(
  value: number | null,
  unit: "%" | "days" | "count",
) {
  if (value == null) return "—";
  if (unit === "%") return arabicNumber(value) + "%";
  if (unit === "days") return arabicNumber(value) + " يوم";
  return arabicNumber(value);
}

function draftFromReview(review: ExecutiveGovernanceReview): ReviewDraft {
  return {
    id: review.id,
    expected_version: review.version,
    period_label: review.period_label,
    review_date: review.review_date,
    assurance_conclusion: review.assurance_conclusion,
    summary: review.summary,
    management_response: review.management_response ?? "",
    evidence_snapshot: review.evidence_snapshot.map((row) => ({ ...row })),
  };
}

function EvidenceEditor({
  items,
  onChange,
}: {
  items: GovernanceAssuranceEvidenceItem[];
  onChange: (items: GovernanceAssuranceEvidenceItem[]) => void;
}) {
  const [draft, setDraft] = useState<EvidenceDraft>({
    type: "note",
    title: "",
    reference: "",
    note: "",
  });

  const canAdd =
    !!draft.title.trim() &&
    !!draft.reference.trim() &&
    (draft.type !== "url" || /^https?:\/\//i.test(draft.reference.trim()));

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-brand" />
        <div>
          <p className="text-xs font-semibold">Evidence</p>
          <p className="text-[8px] text-muted-foreground">
            Note / Reference / URL فقط. Finalize يقفل القائمة.
          </p>
        </div>
      </div>

      {!!items.length && (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 rounded-lg border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold">{item.title}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                    {EVIDENCE_LABELS[item.type]}
                  </span>
                </div>
                <p className="mt-1 break-all text-[8px] text-muted-foreground">
                  {item.reference}
                </p>
                {item.note && (
                  <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                    {item.note}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(items.filter((row) => row.id !== item.id))
                }
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                title="حذف Evidence"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-[130px_1fr_1.2fr]">
        <select
          value={draft.type}
          onChange={(event) =>
            setDraft({
              ...draft,
              type: event.target.value as GovernanceAssuranceEvidenceType,
            })
          }
          className="rounded-lg border border-border bg-card px-2 py-2 text-[10px]"
        >
          <option value="note">Note</option>
          <option value="reference">Reference</option>
          <option value="url">URL</option>
        </select>
        <input
          value={draft.title}
          maxLength={180}
          placeholder="عنوان Evidence"
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
          className="rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
        />
        <input
          value={draft.reference}
          maxLength={2000}
          placeholder={
            draft.type === "url"
              ? "https://..."
              : "النص أو المرجع الذي تعتمد عليه"
          }
          onChange={(event) =>
            setDraft({ ...draft, reference: event.target.value })
          }
          className="rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
        />
      </div>
      <textarea
        rows={2}
        value={draft.note}
        maxLength={4000}
        placeholder="ملاحظة إضافية — اختياري"
        onChange={(event) =>
          setDraft({ ...draft, note: event.target.value })
        }
        className="mt-2 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
      />
      <button
        type="button"
        disabled={!canAdd || items.length >= 50}
        onClick={() => {
          onChange([
            ...items,
            {
              id: crypto.randomUUID(),
              type: draft.type,
              title: draft.title.trim(),
              reference: draft.reference.trim(),
              note: draft.note.trim() || null,
            },
          ]);
          setDraft({
            type: "note",
            title: "",
            reference: "",
            note: "",
          });
        }}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        إضافة Evidence
      </button>
    </div>
  );
}

function AssurancePack({
  review,
  signoff,
  distribution,
}: {
  review: ExecutiveGovernanceReview;
  signoff: GovernanceAssuranceSignoff | null;
  distribution: GovernanceAssuranceDistribution | null;
}) {
  const meta = CONCLUSION_META[review.assurance_conclusion];
  const met = review.target_assessments_snapshot.filter(
    (row) => row.status === "met",
  ).length;
  const notMet = review.target_assessments_snapshot.filter(
    (row) => row.status === "not_met",
  ).length;
  const noTarget = review.target_assessments_snapshot.filter(
    (row) => row.status === "no_target",
  ).length;
  const insufficient = review.target_assessments_snapshot.filter(
    (row) => row.status === "insufficient_data",
  ).length;
  const activeExceptions = review.exceptions_snapshot.filter(
    (row) =>
      row.status === "open" ||
      row.status === "mitigating" ||
      row.status === "accepted",
  );
  const resolvedExceptions = review.exceptions_snapshot.filter(
    (row) => row.status === "resolved",
  );

  return (
    <div
      data-governance-assurance-print
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]"
    >
      <header className="assurance-avoid-break border-b border-border p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Executive Governance Assurance Pack
            </p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand" />
              {review.period_label}
            </h3>
            <p className="mt-1 text-[9px] text-muted-foreground">
              Snapshot generated {formatTimestamp(review.source_generated_at)}
              {" · "}Target v{arabicNumber(review.target_version)}
              {" · "}{arabicNumber(review.source_window_meeting_ids.length)} source meeting(s)
            </p>
          </div>
          <div className="text-end">
            <span
              className={
                "inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold " +
                meta.className
              }
            >
              {meta.label}
            </span>
            <p className="mt-1 text-[8px] text-muted-foreground">
              Review {formatDate(review.review_date)}
              {" · "}
              {review.status === "finalized" ? "Finalized" : "Draft"}
            </p>
          </div>
        </div>
      </header>

      <section className="assurance-avoid-break grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ["Met", met, "text-success"],
          ["Not Met", notMet, "text-danger"],
          ["No Target", noTarget, "text-muted-foreground"],
          ["Insufficient", insufficient, "text-info"],
          ["Exceptions", review.exceptions_snapshot.length, "text-warning"],
          ["Active", activeExceptions.length, "text-warning"],
          ["Resolved", resolvedExceptions.length, "text-success"],
          ["Evidence", review.evidence_snapshot.length, "text-brand"],
        ].map(([label, value, tone]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-border bg-background p-3"
          >
            <p className="text-[8px] text-muted-foreground">{label}</p>
            <p className={"mt-1 text-xl font-bold " + tone}>
              {arabicNumber(value as number)}
            </p>
          </div>
        ))}
      </section>

      <section className="assurance-avoid-break border-b border-border p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <p className="text-xs font-semibold">Assurance Summary</p>
            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">
              {review.summary}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold">Management Response</p>
            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">
              {review.management_response ?? "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="assurance-page-break border-b border-border p-4 md:p-5">
        <div>
          <p className="text-sm font-semibold">Target Assurance</p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            Actual/Target status locked from the source snapshot.
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {review.target_assessments_snapshot.map((row) => (
            <div
              key={row.key}
              className="assurance-avoid-break rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold">{row.label}</p>
                <span
                  className={
                    row.status === "met"
                      ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                      : row.status === "not_met"
                        ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                        : row.status === "insufficient_data"
                          ? "rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info"
                          : "rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
                  }
                >
                  {row.status}
                </span>
              </div>
              <p className="mt-2 text-base font-semibold">
                {formatMetricValue(row.actual, row.unit)}
              </p>
              <p className="mt-1 text-[8px] text-muted-foreground">
                Target {row.operator === "gte" ? "≥" : "≤"}{" "}
                {formatMetricValue(row.target, row.unit)}
              </p>
              <p className="mt-1 text-[8px] text-muted-foreground">
                Previous {formatMetricValue(row.trend.previous, row.unit)}
                {" · "}Δ{" "}
                {row.trend.delta == null
                  ? "—"
                  : (row.trend.delta > 0 ? "+" : "") +
                    formatMetricValue(row.trend.delta, row.unit)}
                {" · "}{row.trend.direction}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-border bg-background p-3 text-[9px]">
          <strong>Operating Rhythm:</strong>{" "}
          {review.operating_rhythm_snapshot.status}
          {" · "}Cadence{" "}
          {review.operating_rhythm_snapshot.cadence_days == null
            ? "—"
            : arabicNumber(review.operating_rhythm_snapshot.cadence_days) +
              " يوم"}
          {" · "}Last{" "}
          {formatDate(
            review.operating_rhythm_snapshot.last_finalized_meeting_date,
          )}
          {" · "}Next{" "}
          {formatDate(review.operating_rhythm_snapshot.next_due_date)}
        </div>
      </section>

      <section className="border-b border-border p-4 md:p-5">
        <p className="text-sm font-semibold">
          Exceptions & Corrective Actions
        </p>
        {!review.exceptions_snapshot.length ? (
          <div className="mt-3 rounded-xl border border-success/20 bg-success/5 p-4 text-xs text-success">
            لا توجد Exceptions ضمن Snapshot.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {review.exceptions_snapshot.map((row) => (
              <div
                key={row.id}
                className="assurance-avoid-break rounded-xl border border-border bg-background p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-[10px] font-semibold">
                    {row.title}
                  </p>
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning">
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  {METRIC_LABELS[row.metric_key] ?? row.metric_key}
                  {" · "}Actual {formatMetricValue(row.actual_value, row.target_unit)}
                  {" · "}Target {row.target_operator === "gte" ? "≥" : "≤"}{" "}
                  {formatMetricValue(row.target_value, row.target_unit)}
                  {" · "}Target v{arabicNumber(row.target_version)}
                </p>
                <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                  {row.rationale}
                </p>
                {row.corrective_action && (
                  <p className="mt-2 text-[9px] leading-4">
                    <strong>Corrective Action:</strong>{" "}
                    {row.corrective_action}
                  </p>
                )}
                <p className="mt-2 text-[8px] text-muted-foreground">
                  {row.responsible_name ?? "بدون مسؤول"}
                  {row.due_date ? " · Due " + formatDate(row.due_date) : ""}
                  {" · Exception v"}{arabicNumber(row.version)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="p-4 md:p-5">
        <p className="text-sm font-semibold">Evidence Register</p>
        {!review.evidence_snapshot.length ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            لم تُسجل Evidence في هذه المراجعة.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            {review.evidence_snapshot.map((row) => (
              <div
                key={row.id}
                className="assurance-avoid-break border-t border-border bg-background p-3 first:border-t-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold">{row.title}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                    {EVIDENCE_LABELS[row.type]}
                  </span>
                </div>
                <p className="mt-1 break-all text-[8px] text-muted-foreground">
                  {row.reference}
                </p>
                {row.note && (
                  <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                    {row.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {signoff && (
        <section className="assurance-page-break border-b border-border p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Attestation & Sign-off</p>
            <span
              className={
                signoff.status === "completed"
                  ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                  : signoff.status === "declined"
                    ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                    : "rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info"
              }
            >
              {signoff.status}
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {signoff.attestations.map((item) => (
              <div
                key={item.id}
                className="assurance-avoid-break rounded-xl border border-border bg-background p-3"
              >
                <p className="text-[8px] text-muted-foreground">
                  {item.role === "prepared_by"
                    ? "Prepared By"
                    : item.role === "reviewed_by"
                      ? "Reviewed By"
                      : "Approved By"}
                </p>
                <p className="mt-1 text-[10px] font-semibold">
                  {item.assignee_name_snapshot}
                </p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  {item.assignee_email_snapshot ?? "—"}
                </p>
                <p className="mt-2 text-[8px]">
                  Status: <strong>{item.status}</strong>
                  {item.acted_at ? " · " + formatTimestamp(item.acted_at) : ""}
                </p>
                {item.statement && (
                  <p className="mt-2 whitespace-pre-wrap text-[8px] leading-4 text-muted-foreground">
                    {item.statement}
                  </p>
                )}
                {item.reservation && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-warning/20 bg-warning/5 p-2 text-[8px] leading-4 text-warning">
                    Reservation: {item.reservation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {distribution && (
        <section className="assurance-page-break border-b border-border p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Distribution Register</p>
            <span
              className={
                distribution.status === "closed"
                  ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                  : distribution.status === "distributed"
                    ? "rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info"
                    : "rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
              }
            >
              {distribution.status}
            </span>
          </div>
          <p className="mt-1 text-[8px] text-muted-foreground">
            Distributed {formatTimestamp(distribution.distributed_at)}
            {" · "}Closed {formatTimestamp(distribution.closed_at)}
          </p>
          {distribution.distribution_note && (
            <p className="mt-3 whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">
              {distribution.distribution_note}
            </p>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {distribution.recipients.map((recipient) => (
              <div
                key={recipient.id}
                className="assurance-avoid-break rounded-xl border border-border bg-background p-3"
              >
                <p className="text-[10px] font-semibold">
                  {recipient.recipient_name_snapshot}
                </p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  {recipient.recipient_email_snapshot ?? "—"}
                </p>
                <p className="mt-2 text-[8px]">
                  Status: <strong>{recipient.status}</strong>
                  {recipient.acknowledged_at
                    ? " · " + formatTimestamp(recipient.acknowledged_at)
                    : ""}
                </p>
                {recipient.acknowledgement_note && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-info/20 bg-info/5 p-2 text-[8px] leading-4 text-info">
                    Note: {recipient.acknowledgement_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-border p-4 text-[8px] leading-4 text-muted-foreground">
        <strong className="text-foreground">Audit basis:</strong> This pack is
        a stored snapshot. Finalized reviews cannot be edited. A later target,
        exception, or meeting change requires a new review cycle rather than
        rewriting this record.
      </footer>
    </div>
  );
}

export function ExecutiveGovernanceAssuranceCenter({
  reviewData,
  targetData,
  exceptionData,
  meetingData,
  isLoading,
}: {
  reviewData: ExecutiveGovernanceReviewsData | undefined;
  targetData: ExecutiveGovernanceTargetsData | undefined;
  exceptionData: ExecutiveGovernanceExceptionsData | undefined;
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  isLoading: boolean;
}) {
  const create = useCreateExecutiveGovernanceReview();
  const update = useUpdateExecutiveGovernanceReview();
  const finalize = useFinalizeExecutiveGovernanceReview();
  const cadence = useGovernanceAssuranceCadence();
  const signoffs = useGovernanceAssuranceSignoffs();
  const distributions = useGovernanceAssuranceDistributions();
  const saveCadence = useSaveGovernanceAssuranceCadence();
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [cadenceDraft, setCadenceDraft] = useState<CadenceDraft>({
    review_interval_days: "",
    warning_days_before: "",
    first_due_date: "",
    is_enabled: true,
  });
  const [cadenceDraftSourceVersion, setCadenceDraftSourceVersion] = useState<
    number | "none" | null
  >(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  useEffect(() => {
    const profile = cadence.data?.profile;
    const sourceVersion = profile?.version ?? "none";
    if (cadenceDraftSourceVersion === sourceVersion) return;

    setCadenceDraft({
      review_interval_days: profile
        ? String(profile.review_interval_days)
        : "",
      warning_days_before:
        profile?.warning_days_before == null
          ? ""
          : String(profile.warning_days_before),
      first_due_date: profile?.first_due_date ?? "",
      is_enabled: profile?.is_enabled ?? true,
    });
    setCadenceDraftSourceVersion(sourceVersion);
  }, [cadence.data?.profile, cadenceDraftSourceVersion]);

  const trends = useMemo(
    () =>
      meetingData ? buildExecutiveGovernanceTrends(meetingData) : null,
    [meetingData],
  );
  const evaluation = useMemo(
    () =>
      targetData && meetingData && trends
        ? evaluateExecutiveGovernanceTargets(
            targetData,
            trends,
            meetingData,
          )
        : null,
    [targetData, meetingData, trends],
  );

  if (isLoading || cadence.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل Governance Assurance Reviews…
        </div>
      </section>
    );
  }

  if (!reviewData || !targetData || !exceptionData || !meetingData || !trends || !evaluation) {
    return null;
  }

  const profile = targetData.profile;
  const reviews = reviewData.reviews;
  const selectedReview =
    reviews.find((row) => row.id === selectedReviewId) ??
    reviews.find((row) => row.status === "finalized") ??
    reviews[0] ??
    null;
  const drafts = reviews.filter((row) => row.status === "draft");
  const finalizedReviews = reviews.filter(
    (row) => row.status === "finalized",
  );
  const canCreate =
    !!profile &&
    trends.period.current_meeting_ids.length > 0 &&
    evaluation.assessments.length === 8;

  function beginCreate() {
    setDraft({
      period_label:
        trends.period.current_label === "—"
          ? "Governance Review"
          : trends.period.current_label,
      review_date: todayKey(),
      assurance_conclusion: "",
      summary: "",
      management_response: "",
      evidence_snapshot: [],
    });
  }

  function printReview(review: ExecutiveGovernanceReview) {
    setSelectedReviewId(review.id);
    requestAnimationFrame(() => {
      document.body.dataset.printMode = "governance-assurance";
      const cleanup = () => {
        delete document.body.dataset.printMode;
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
    });
  }

  return (
    <section className="space-y-4">
      <style>{ASSURANCE_PRINT_STYLE}</style>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardCheck className="h-5 w-5 text-brand" />
            Governance Review & Assurance Pack
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review cycle رسمي يحفظ Target/Breach/Exception snapshots والأدلة
            ثم يقفلها عند Finalize. لا يعيد تفسير Review قديمة بعد تغيير Targets.
          </p>
        </div>

        <button
          type="button"
          disabled={!canCreate}
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          <FilePlus2 className="h-4 w-4" />
          إنشاء Review Snapshot
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <Archive className="h-4 w-4 text-brand" />
          <p className="mt-2 text-2xl font-bold">
            {arabicNumber(reviews.length)}
          </p>
          <p className="text-xs text-muted-foreground">Total Reviews</p>
        </div>
        <div className="rounded-2xl border border-warning/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <Pencil className="h-4 w-4 text-warning" />
          <p className="mt-2 text-2xl font-bold text-warning">
            {arabicNumber(drafts.length)}
          </p>
          <p className="text-xs text-muted-foreground">Draft Reviews</p>
        </div>
        <div className="rounded-2xl border border-success/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <LockKeyhole className="h-4 w-4 text-success" />
          <p className="mt-2 text-2xl font-bold text-success">
            {arabicNumber(finalizedReviews.length)}
          </p>
          <p className="text-xs text-muted-foreground">Finalized Reviews</p>
        </div>
        <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <History className="h-4 w-4 text-info" />
          <p className="mt-2 text-2xl font-bold text-info">
            {arabicNumber(reviewData.history.length)}
          </p>
          <p className="text-xs text-muted-foreground">Version Snapshots</p>
        </div>
      </div>

      {cadence.data && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold">
                  Assurance Review Cadence
                </h3>
                <span
                  className={
                    "rounded-full px-2.5 py-1 text-[8px] font-semibold " +
                    CADENCE_META[cadence.data.status].className
                  }
                >
                  {CADENCE_META[cadence.data.status].label}
                </span>
              </div>
              <p className="mt-1 text-[9px] text-muted-foreground">
                لا توجد قيم افتراضية. First Due Date تستخدم فقط حتى أول Review
                Finalized؛ بعدها يصبح Next Due = آخر Finalized Review + Interval.
                إنشاء Draft وحده لا يعيد ضبط الدورة؛ Finalize فقط هو الذي يبدأ
                الدورة التالية.
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Last Finalized</p>
                  <p className="mt-1 text-xs font-semibold">
                    {formatDate(cadence.data.latest_finalized_review_date)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Next Due</p>
                  <p className="mt-1 text-xs font-semibold">
                    {formatDate(cadence.data.next_due_date)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Warning Date</p>
                  <p className="mt-1 text-xs font-semibold">
                    {formatDate(cadence.data.warning_date)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Days To Due</p>
                  <p
                    className={
                      cadence.data.status === "overdue"
                        ? "mt-1 text-xs font-semibold text-danger"
                        : cadence.data.status === "due_soon"
                          ? "mt-1 text-xs font-semibold text-warning"
                          : "mt-1 text-xs font-semibold"
                    }
                  >
                    {cadence.data.days_to_due == null
                      ? "—"
                      : arabicNumber(cadence.data.days_to_due) + " يوم"}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full rounded-xl border border-border bg-background p-3 xl:max-w-xl">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[9px] text-muted-foreground">
                  Review Interval Days
                  <input
                    type="number"
                    min={1}
                    max={366}
                    step={1}
                    value={cadenceDraft.review_interval_days}
                    placeholder="مثال: 30"
                    onChange={(event) =>
                      setCadenceDraft({
                        ...cadenceDraft,
                        review_interval_days: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[9px] text-muted-foreground">
                  Warning Days Before
                  <input
                    type="number"
                    min={0}
                    max={90}
                    step={1}
                    value={cadenceDraft.warning_days_before}
                    placeholder="اختياري"
                    onChange={(event) =>
                      setCadenceDraft({
                        ...cadenceDraft,
                        warning_days_before: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[9px] text-muted-foreground">
                  First Due Date
                  <input
                    type="date"
                    value={cadenceDraft.first_due_date}
                    onChange={(event) =>
                      setCadenceDraft({
                        ...cadenceDraft,
                        first_due_date: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-lg border border-border px-3 py-2 text-[10px]">
                  <input
                    type="checkbox"
                    checked={cadenceDraft.is_enabled}
                    onChange={(event) =>
                      setCadenceDraft({
                        ...cadenceDraft,
                        is_enabled: event.target.checked,
                      })
                    }
                  />
                  Cadence Enabled
                </label>
              </div>
              <button
                type="button"
                disabled={
                  saveCadence.isPending ||
                  !cadenceDraft.review_interval_days ||
                  !cadenceDraft.first_due_date
                }
                onClick={() =>
                  saveCadence.mutate({
                    expected_version: cadence.data?.profile?.version ?? null,
                    review_interval_days:
                      optionalInteger(cadenceDraft.review_interval_days) ??
                      Number.NaN,
                    warning_days_before: optionalInteger(
                      cadenceDraft.warning_days_before,
                    ),
                    first_due_date: cadenceDraft.first_due_date,
                    is_enabled: cadenceDraft.is_enabled,
                  })
                }
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                حفظ Assurance Cadence
              </button>
            </div>
          </div>
        </div>
      )}

      {!canCreate && (
        <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
          إنشاء Assurance Review يحتاج Governance Targets محفوظة ونافذة Current
          تحتوي اجتماعًا Finalized واحدًا على الأقل. النظام لا ينشئ Review من
          بيانات ناقصة أو نافذة بلا مصدر.
        </div>
      )}

      {draft && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {draft.id ? "تحرير Draft Review" : "Review Snapshot جديد"}
              </h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {draft.id
                  ? "Source snapshot ثابت؛ التعديل يقتصر على Narrative وEvidence."
                  : "Target v" +
                    (profile ? arabicNumber(profile.version) : "—") +
                    " · " +
                    arabicNumber(trends.period.current_meeting_ids.length) +
                    " source meeting(s)"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">
              Period Label
              <input
                value={draft.period_label}
                maxLength={180}
                onChange={(event) =>
                  setDraft({ ...draft, period_label: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Review Date
              <input
                type="date"
                max={todayKey()}
                value={draft.review_date}
                onChange={(event) =>
                  setDraft({ ...draft, review_date: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground md:col-span-2">
              Assurance Conclusion
              <select
                value={draft.assurance_conclusion}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    assurance_conclusion:
                      event.target.value as GovernanceAssuranceConclusion | "",
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">اختر Conclusion يدويًا</option>
                <option value="satisfactory">Satisfactory</option>
                <option value="needs_improvement">Needs Improvement</option>
                <option value="unsatisfactory">Unsatisfactory</option>
                <option value="insufficient_evidence">Insufficient Evidence</option>
              </select>
              <span className="mt-1 block text-[8px] leading-4">
                النظام لا يستنتج Conclusion تلقائيًا من عدد الـBreaches.
              </span>
            </label>
            <label className="text-[10px] text-muted-foreground md:col-span-2">
              Assurance Summary
              <textarea
                rows={4}
                maxLength={12000}
                value={draft.summary}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground md:col-span-2">
              Management Response
              <textarea
                rows={3}
                maxLength={12000}
                value={draft.management_response}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    management_response: event.target.value,
                  })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-3">
            <EvidenceEditor
              items={draft.evidence_snapshot}
              onChange={(items) =>
                setDraft({ ...draft, evidence_snapshot: items })
              }
            />
          </div>

          <button
            type="button"
            disabled={
              create.isPending ||
              update.isPending ||
              !draft.period_label.trim() ||
              !draft.review_date ||
              !draft.assurance_conclusion ||
              !draft.summary.trim() ||
              (!draft.id && !canCreate)
            }
            onClick={() => {
              if (!draft.assurance_conclusion) return;
              if (draft.id) {
                update.mutate(
                  {
                    id: draft.id,
                    expected_version: draft.expected_version!,
                    period_label: draft.period_label,
                    review_date: draft.review_date,
                    assurance_conclusion: draft.assurance_conclusion,
                    summary: draft.summary,
                    management_response:
                      draft.management_response || null,
                    evidence_snapshot: draft.evidence_snapshot,
                  },
                  { onSuccess: () => setDraft(null) },
                );
                return;
              }

              create.mutate(
                {
                  period_label: draft.period_label,
                  review_date: draft.review_date,
                  assurance_conclusion: draft.assurance_conclusion,
                  summary: draft.summary,
                  management_response: draft.management_response || null,
                  expected_target_version: profile!.version,
                  source_window_meeting_ids:
                    trends.period.current_meeting_ids,
                  target_assessments_snapshot: evaluation.assessments,
                  operating_rhythm_snapshot: evaluation.rhythm,
                  exceptions_snapshot: exceptionData.exceptions
                    .filter((row) => row.status !== "cancelled")
                    .slice(0, 100),
                  evidence_snapshot: draft.evidence_snapshot,
                  source_generated_at: trends.generated_at,
                },
                {
                  onSuccess: (review) => {
                    setSelectedReviewId(review.id);
                    setDraft(null);
                  },
                },
              );
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {draft.id ? "حفظ Draft" : "إنشاء Snapshot"}
          </button>
        </div>
      )}

      <ExecutiveGovernanceAssuranceHistory data={reviewData} />

      <ExecutiveGovernanceAssuranceSignoff
        reviewData={reviewData}
        meetingData={meetingData}
      />

      <ExecutiveGovernanceAssuranceDistribution
        reviewData={reviewData}
        meetingData={meetingData}
      />

      <ExecutiveGovernanceAssuranceArchiveVault />

      <ExecutiveGovernanceAssuranceRemediationAnalytics />

      <ExecutiveGovernanceAssuranceRecurrenceRadar />

      <ExecutiveGovernanceAssuranceFindings />

      {!!reviews.length && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Review Register</h3>
              <p className="text-[9px] text-muted-foreground">
                Finalized = Locked. Draft يسمح فقط بتعديل Narrative/Evidence.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {reviews.map((review) => {
              const meta = CONCLUSION_META[review.assurance_conclusion];
              const historyCount = reviewData.history.filter(
                (row) => row.review_id === review.id,
              ).length;
              const finalizeBlocked =
                (review.assurance_conclusion === "needs_improvement" ||
                  review.assurance_conclusion === "unsatisfactory") &&
                !review.management_response?.trim();
              return (
                <div
                  key={review.id}
                  className={
                    selectedReview?.id === review.id
                      ? "rounded-xl border border-brand/30 bg-brand/[0.03] p-3"
                      : "rounded-xl border border-border bg-background p-3"
                  }
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <button
                      type="button"
                      onClick={() => setSelectedReviewId(review.id)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">
                          {review.period_label}
                        </p>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[8px] " +
                            meta.className
                          }
                        >
                          {meta.label}
                        </span>
                        <span
                          className={
                            review.status === "finalized"
                              ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                              : "rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning"
                          }
                        >
                          {review.status === "finalized" ? "Finalized" : "Draft"}
                        </span>
                      </div>
                      <p className="mt-1 text-[8px] text-muted-foreground">
                        Review {formatDate(review.review_date)}
                        {" · Target v"}{arabicNumber(review.target_version)}
                        {" · Review v"}{arabicNumber(review.version)}
                        {" · "}{arabicNumber(historyCount)} history snapshot(s)
                      </p>
                    </button>

                    <div className="flex flex-wrap gap-2">
                      {review.status === "draft" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReviewId(review.id);
                              setDraft(draftFromReview(review));
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            تحرير
                          </button>
                          {finalizeBlocked && (
                            <span className="self-center text-[8px] text-warning">
                              Management Response مطلوبة
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={finalize.isPending || finalizeBlocked}
                            title={
                              finalizeBlocked
                                ? "Management Response مطلوبة قبل Finalize."
                                : "Finalize & Lock"
                            }
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Finalize سيقفل Review نهائيًا. هل تريد المتابعة؟",
                                )
                              ) {
                                return;
                              }
                              finalize.mutate({
                                id: review.id,
                                expectedVersion: review.version,
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1.5 text-[9px] font-semibold text-white disabled:opacity-50"
                          >
                            <LockKeyhole className="h-3.5 w-3.5" />
                            Finalize & Lock
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          downloadGovernanceAssuranceReviewCsv(review)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] hover:bg-muted"
                      >
                        <Download className="h-3.5 w-3.5" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => printReview(review)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] hover:bg-muted"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        طباعة
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedReview ? (
        <AssurancePack
          review={selectedReview}
          signoff={
            signoffs.data?.owned.find(
              (row) => row.review.id === selectedReview.id,
            )?.signoff ?? null
          }
          distribution={
            distributions.data?.owned.find(
              (row) => row.review.id === selectedReview.id,
            )?.distribution ?? null
          }
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد Governance Assurance Reviews بعد.
        </div>
      )}

      <div
        data-assurance-screen-only
        className="flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground"
      >
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        Evidence هنا مرجع تدقيقي نصي/رابط، وليس رفع ملف جديد. Finalized Review
        تحتفظ بالنص/الرابط كما كان وقت الإغلاق، بينما أي مستند خارجي يبقى في
        مصدره الأصلي.
      </div>

      {!!finalizedReviews.length && (
        <div
          data-assurance-screen-only
          className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-[9px] leading-5 text-muted-foreground"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          يوجد {arabicNumber(finalizedReviews.length)} Review Finalized ومقفلة.
          أي دورة لاحقة يجب إنشاؤها كـReview جديدة بدل تعديل سجل assurance سابق.
        </div>
      )}
    </section>
  );
}

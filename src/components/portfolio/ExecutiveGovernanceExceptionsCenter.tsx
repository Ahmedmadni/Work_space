import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  History,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useCreateExecutiveGovernanceException,
  useUpdateExecutiveGovernanceException,
} from "@/hooks/use-governance-exceptions";
import { arabicNumber } from "@/lib/format";
import { buildExecutiveGovernanceTrends } from "@/services/governance-trends.service";
import { evaluateExecutiveGovernanceTargets } from "@/services/governance-targets.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  ExecutiveGovernanceException,
  ExecutiveGovernanceExceptionsData,
  GovernanceExceptionMetricKey,
  GovernanceExceptionStatus,
} from "@/types/governance-exceptions";
import type {
  ExecutiveGovernanceTargetsData,
  GovernanceTargetAssessment,
} from "@/types/governance-targets";

const STATUS_LABELS: Record<GovernanceExceptionStatus, string> = {
  open: "Open",
  mitigating: "Mitigating",
  accepted: "Accepted",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

interface CreateDraft {
  metric_key: GovernanceExceptionMetricKey;
  title: string;
  rationale: string;
  corrective_action: string;
  responsible_name: string;
  due_date: string;
}

interface EditDraft {
  id: string;
  expected_version: number;
  title: string;
  rationale: string;
  corrective_action: string;
  responsible_name: string;
  due_date: string;
  status: GovernanceExceptionStatus;
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
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

function formatValue(
  value: number,
  unit: ExecutiveGovernanceException["target_unit"],
) {
  if (unit === "%") return arabicNumber(value) + "%";
  if (unit === "days") return arabicNumber(value) + " يوم";
  return arabicNumber(value);
}

function assessmentValue(assessment: GovernanceTargetAssessment) {
  if (assessment.actual == null) return "—";
  if (assessment.unit === "%") return arabicNumber(assessment.actual) + "%";
  if (assessment.unit === "days") {
    return arabicNumber(assessment.actual) + " يوم";
  }
  return arabicNumber(assessment.actual);
}

function targetValue(assessment: GovernanceTargetAssessment) {
  if (assessment.target == null) return "—";
  const prefix = assessment.operator === "gte" ? "≥ " : "≤ ";
  if (assessment.unit === "%") {
    return prefix + arabicNumber(assessment.target) + "%";
  }
  if (assessment.unit === "days") {
    return prefix + arabicNumber(assessment.target) + " يوم";
  }
  return prefix + arabicNumber(assessment.target);
}

function activeException(row: ExecutiveGovernanceException) {
  return (
    row.status === "open" ||
    row.status === "mitigating" ||
    row.status === "accepted"
  );
}

function draftFromException(row: ExecutiveGovernanceException): EditDraft {
  return {
    id: row.id,
    expected_version: row.version,
    title: row.title,
    rationale: row.rationale,
    corrective_action: row.corrective_action ?? "",
    responsible_name: row.responsible_name ?? "",
    due_date: row.due_date ?? "",
    status: row.status,
  };
}

export function ExecutiveGovernanceExceptionsCenter({
  exceptionData,
  targetData,
  meetingData,
  isLoading,
}: {
  exceptionData: ExecutiveGovernanceExceptionsData | undefined;
  targetData: ExecutiveGovernanceTargetsData | undefined;
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  isLoading: boolean;
}) {
  const create = useCreateExecutiveGovernanceException();
  const update = useUpdateExecutiveGovernanceException();
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

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

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل Governance Exceptions…
        </div>
      </section>
    );
  }

  if (!exceptionData || !targetData || !meetingData || !trends || !evaluation) {
    return null;
  }

  const profile = targetData.profile;
  const today = todayKey();
  const active = exceptionData.exceptions.filter(activeException);
  const closed = exceptionData.exceptions.filter(
    (row) => row.status === "resolved" || row.status === "cancelled",
  );
  const activeByMetric = new Map(
    active.map((row) => [row.metric_key, row] as const),
  );
  const breached = evaluation.assessments.filter(
    (row) => row.status === "not_met",
  );
  const actionableBreaches = breached.filter(
    (row) => !activeByMetric.has(row.key),
  );
  const overdue = active.filter(
    (row) => !!row.due_date && row.due_date < today,
  );
  const accepted = active.filter((row) => row.status === "accepted");

  function beginCreate(assessment: GovernanceTargetAssessment) {
    setEditDraft(null);
    setCreateDraft({
      metric_key: assessment.key,
      title: assessment.label + " — Governance Exception",
      rationale: "",
      corrective_action: "",
      responsible_name: "",
      due_date: "",
    });
  }

  const selectedAssessment = createDraft
    ? evaluation.assessments.find(
        (row) => row.key === createDraft.metric_key,
      ) ?? null
    : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert className="h-5 w-5 text-brand" />
            Governance Exceptions & Corrective Actions
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            الاستثناء يسجل لماذا Target غير محقق، من يتابع المعالجة، والموعد.
            Snapshot المقياس والـTarget Version لا يتغيران بعد الإنشاء.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card px-3 py-2 text-[9px] text-muted-foreground">
          <p>
            Current target version:{" "}
            <strong className="text-foreground">
              {profile ? "v" + arabicNumber(profile.version) : "—"}
            </strong>
          </p>
          <p className="mt-1">
            Current window:{" "}
            <strong className="text-foreground">
              {arabicNumber(trends.period.current_meeting_ids.length)} meeting(s)
            </strong>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-warning/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <FileWarning className="h-4 w-4 text-warning" />
          <p className="mt-2 text-2xl font-bold text-warning">
            {arabicNumber(active.length)}
          </p>
          <p className="text-xs text-muted-foreground">Active Exceptions</p>
        </div>
        <div className="rounded-2xl border border-danger/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <AlertTriangle className="h-4 w-4 text-danger" />
          <p className="mt-2 text-2xl font-bold text-danger">
            {arabicNumber(overdue.length)}
          </p>
          <p className="text-xs text-muted-foreground">Overdue Corrective Actions</p>
        </div>
        <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <ShieldAlert className="h-4 w-4 text-info" />
          <p className="mt-2 text-2xl font-bold text-info">
            {arabicNumber(accepted.length)}
          </p>
          <p className="text-xs text-muted-foreground">Accepted Exceptions</p>
        </div>
        <div className="rounded-2xl border border-success/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <p className="mt-2 text-2xl font-bold text-success">
            {arabicNumber(closed.filter((row) => row.status === "resolved").length)}
          </p>
          <p className="text-xs text-muted-foreground">Resolved Exceptions</p>
        </div>
      </div>

      {!!breached.length && (
        <div className="rounded-2xl border border-danger/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div>
            <h3 className="text-sm font-semibold">Current Target Breaches</h3>
            <p className="mt-1 text-[9px] text-muted-foreground">
              يمكن إنشاء Exception فقط لمقياس Not Met وله Target فعلي ونافذة
              اجتماعات حالية.
            </p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {breached.map((assessment) => {
              const existing = activeByMetric.get(assessment.key);
              return (
                <div
                  key={assessment.key}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <p className="text-xs font-semibold">{assessment.label}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[9px]">
                    <span className="text-danger">
                      Actual {assessmentValue(assessment)}
                    </span>
                    <span className="text-muted-foreground">
                      Target {targetValue(assessment)}
                    </span>
                  </div>
                  {existing ? (
                    <p className="mt-3 rounded-lg bg-warning/10 px-2 py-1.5 text-[8px] text-warning">
                      Exception نشط بالفعل — {STATUS_LABELS[existing.status]}
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        !profile ||
                        trends.period.current_meeting_ids.length === 0
                      }
                      onClick={() => beginCreate(assessment)}
                      className="mt-3 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] font-medium hover:bg-muted disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      تسجيل Exception
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {createDraft && selectedAssessment && profile && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                Governance Exception جديد
              </h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {selectedAssessment.label}: Actual{" "}
                {assessmentValue(selectedAssessment)} · Target{" "}
                {targetValue(selectedAssessment)} · Target Version v
                {arabicNumber(profile.version)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">
              العنوان
              <input
                value={createDraft.title}
                maxLength={240}
                onChange={(event) =>
                  setCreateDraft({
                    ...createDraft,
                    title: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              مسؤول المتابعة
              <input
                value={createDraft.responsible_name}
                maxLength={180}
                placeholder="اسم المسؤول — اختياري"
                onChange={(event) =>
                  setCreateDraft({
                    ...createDraft,
                    responsible_name: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Due Date
              <input
                type="date"
                value={createDraft.due_date}
                onChange={(event) =>
                  setCreateDraft({
                    ...createDraft,
                    due_date: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <div className="rounded-lg border border-border bg-background p-3 text-[9px] text-muted-foreground">
              Source window:{" "}
              {arabicNumber(trends.period.current_meeting_ids.length)} meeting(s)
              <br />
              Snapshot يظل ثابتًا حتى لو تغيّر Target لاحقًا.
            </div>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              مبرر الاستثناء
              <textarea
                rows={3}
                maxLength={6000}
                value={createDraft.rationale}
                onChange={(event) =>
                  setCreateDraft({
                    ...createDraft,
                    rationale: event.target.value,
                  })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              Corrective Action
              <textarea
                rows={3}
                maxLength={6000}
                value={createDraft.corrective_action}
                onChange={(event) =>
                  setCreateDraft({
                    ...createDraft,
                    corrective_action: event.target.value,
                  })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={
              create.isPending ||
              !createDraft.title.trim() ||
              !createDraft.rationale.trim() ||
              selectedAssessment.actual == null
            }
            onClick={() =>
              create.mutate(
                {
                  expected_target_version: profile.version,
                  metric_key: createDraft.metric_key,
                  title: createDraft.title,
                  rationale: createDraft.rationale,
                  corrective_action:
                    createDraft.corrective_action || null,
                  responsible_name:
                    createDraft.responsible_name || null,
                  due_date: createDraft.due_date || null,
                  actual_value: selectedAssessment.actual!,
                  source_window_meeting_ids:
                    trends.period.current_meeting_ids,
                },
                { onSuccess: () => setCreateDraft(null) },
              )
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            تسجيل Exception
          </button>
        </div>
      )}

      {editDraft && (
        <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">تحديث Exception</h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                Snapshot المقياس لا يتغير؛ يتم تحديث المعالجة والحالة فقط.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">
              العنوان
              <input
                value={editDraft.title}
                maxLength={240}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    title: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Status
              <select
                value={editDraft.status}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    status: event.target.value as GovernanceExceptionStatus,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              مسؤول المتابعة
              <input
                value={editDraft.responsible_name}
                maxLength={180}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    responsible_name: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Due Date
              <input
                type="date"
                value={editDraft.due_date}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    due_date: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              المبرر
              <textarea
                rows={3}
                maxLength={6000}
                value={editDraft.rationale}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    rationale: event.target.value,
                  })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              Corrective Action
              <textarea
                rows={3}
                maxLength={6000}
                value={editDraft.corrective_action}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    corrective_action: event.target.value,
                  })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={
              update.isPending ||
              !editDraft.title.trim() ||
              !editDraft.rationale.trim()
            }
            onClick={() =>
              update.mutate(
                {
                  id: editDraft.id,
                  expected_version: editDraft.expected_version,
                  title: editDraft.title,
                  rationale: editDraft.rationale,
                  corrective_action:
                    editDraft.corrective_action || null,
                  responsible_name:
                    editDraft.responsible_name || null,
                  due_date: editDraft.due_date || null,
                  status: editDraft.status,
                },
                { onSuccess: () => setEditDraft(null) },
              )
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ التحديث
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <h3 className="text-sm font-semibold">Active Exceptions</h3>
        {!active.length ? (
          <div className="mt-3 rounded-xl border border-success/20 bg-success/5 p-5 text-center text-xs text-success">
            لا توجد Governance Exceptions نشطة.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {active.map((row) => {
              const isOverdue = !!row.due_date && row.due_date < today;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">{row.title}</p>
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning">
                          {STATUS_LABELS[row.status]}
                        </span>
                        {isOverdue && (
                          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger">
                            Corrective Action Overdue
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[8px] text-muted-foreground">
                        {row.metric_key} · Actual{" "}
                        {formatValue(row.actual_value, row.target_unit)} · Target{" "}
                        {row.target_operator === "gte" ? "≥ " : "≤ "}
                        {formatValue(row.target_value, row.target_unit)} · Target v
                        {arabicNumber(row.target_version)}
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
                        {" · "}
                        {arabicNumber(row.source_window_meeting_ids.length)} source meeting(s)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateDraft(null);
                        setEditDraft(draftFromException(row));
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تحديث
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!!closed.length && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Closed Exceptions</h3>
              <p className="text-[9px] text-muted-foreground">
                Resolved/Cancelled مع Snapshot الأصلي محفوظًا.
              </p>
            </div>
          </div>

          <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {closed.slice(0, 20).map((row) => (
              <div key={row.id} className="bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs font-semibold">
                    {row.title}
                  </p>
                  <span
                    className={
                      row.status === "resolved"
                        ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                        : "rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
                    }
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </div>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  {row.metric_key} · Created {formatDate(row.created_at)}
                  {row.resolved_at
                    ? " · Resolved " + formatDate(row.resolved_at)
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!exceptionData.history.length && (
        <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
          <strong className="text-foreground">Version History:</strong>{" "}
          {arabicNumber(exceptionData.history.length)} change snapshot(s) محفوظة
          ضمن آخر 50 تعديلًا. Snapshot Actual/Target لكل Exception يبقى ثابتًا
          بينما تتغير خطة المعالجة والحالة بالإصدارات.
        </div>
      )}

      {!breached.length && !active.length && (
        <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-[9px] text-success">
          لا توجد Target Breaches حالية ولا Exceptions نشطة.
        </div>
      )}

      {!!actionableBreaches.length && !profile && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-[9px] text-warning">
          احفظ Governance Targets أولًا قبل تسجيل Exceptions.
        </div>
      )}
    </section>
  );
}

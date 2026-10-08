import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  UserRoundX,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  useGovernanceAssuranceArchives,
} from "@/hooks/use-governance-assurance";
import {
  useGovernanceAssuranceFindings,
  useSaveGovernanceAssuranceFinding,
} from "@/hooks/use-governance-assurance-findings";
import { arabicNumber } from "@/lib/format";
import {
  buildGovernanceAssuranceFindingResponsibleCandidates,
  buildGovernanceAssuranceFindingSourceCandidates,
} from "@/services/governance-assurance-findings.service";
import type {
  GovernanceAssuranceArchive,
} from "@/types/governance-assurance";
import type {
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingSeverity,
  GovernanceAssuranceFindingSourceType,
  GovernanceAssuranceFindingStatus,
} from "@/types/governance-assurance-findings";

interface FindingDraft {
  id: string | null;
  expected_version: number | null;
  archive_id: string;
  source_type: GovernanceAssuranceFindingSourceType;
  source_ref_id: string;
  title: string;
  description: string;
  severity: GovernanceAssuranceFindingSeverity;
  status: GovernanceAssuranceFindingStatus;
  responsible_user_id: string;
  due_date: string;
  corrective_action: string;
  resolution_note: string;
}

const SEVERITY_META: Record<
  GovernanceAssuranceFindingSeverity,
  { label: string; className: string }
> = {
  low: {
    label: "Low",
    className: "bg-muted text-muted-foreground",
  },
  medium: {
    label: "Medium",
    className: "bg-info/10 text-info",
  },
  high: {
    label: "High",
    className: "bg-warning/10 text-warning",
  },
  critical: {
    label: "Critical",
    className: "bg-danger/10 text-danger",
  },
};

const STATUS_META: Record<
  GovernanceAssuranceFindingStatus,
  { label: string; className: string }
> = {
  open: {
    label: "Open",
    className: "bg-danger/10 text-danger",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-warning/10 text-warning",
  },
  resolved: {
    label: "Resolved",
    className: "bg-success/10 text-success",
  },
  accepted: {
    label: "Accepted",
    className: "bg-info/10 text-info",
  },
};

const SOURCE_LABELS: Record<
  GovernanceAssuranceFindingSourceType,
  string
> = {
  manual: "Manual Finding",
  signoff_reservation: "Sign-off Reservation",
  recipient_acknowledgement: "Acknowledgement Note",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(new Date(value + (value.length === 10 ? "T12:00:00Z" : "")));
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function emptyDraft(archiveId: string): FindingDraft {
  return {
    id: null,
    expected_version: null,
    archive_id: archiveId,
    source_type: "manual",
    source_ref_id: "",
    title: "",
    description: "",
    severity: "medium",
    status: "open",
    responsible_user_id: "",
    due_date: "",
    corrective_action: "",
    resolution_note: "",
  };
}

function editDraft(finding: GovernanceAssuranceFinding): FindingDraft {
  return {
    id: finding.id,
    expected_version: finding.version,
    archive_id: finding.archive_id,
    source_type: finding.source_type,
    source_ref_id: finding.source_ref_id ?? "",
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    status: finding.status,
    responsible_user_id: finding.responsible_user_id ?? "",
    due_date: finding.due_date ?? "",
    corrective_action: finding.corrective_action ?? "",
    resolution_note: finding.resolution_note ?? "",
  };
}

function sourceDetail(
  archive: GovernanceAssuranceArchive | null,
  draft: FindingDraft,
) {
  if (!archive || draft.source_type === "manual" || !draft.source_ref_id) {
    return null;
  }
  return (
    buildGovernanceAssuranceFindingSourceCandidates(archive).find(
      (row) =>
        row.type === draft.source_type &&
        row.ref_id === draft.source_ref_id,
    ) ?? null
  );
}

export function ExecutiveGovernanceAssuranceFindings() {
  const findings = useGovernanceAssuranceFindings();
  const archives = useGovernanceAssuranceArchives();
  const saveFinding = useSaveGovernanceAssuranceFinding();
  const [draft, setDraft] = useState<FindingDraft | null>(null);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    GovernanceAssuranceFindingStatus | "all"
  >("all");

  if (findings.isLoading || archives.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4 animate-pulse text-brand" />
          جاري تحميل Assurance Findings…
        </div>
      </section>
    );
  }

  const data = findings.data ?? {
    findings: [],
    manageable_archive_ids: [],
    summary: {
      total: 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
      accepted: 0,
      critical_active: 0,
      high_active: 0,
      overdue_active: 0,
      unassigned_active: 0,
    },
  };
  const archiveRows = archives.data?.archives ?? [];
  const archiveMap = new Map(
    archiveRows.map((archive) => [archive.id, archive] as const),
  );
  const manageableSet = new Set(data.manageable_archive_ids);
  const manageableArchives = archiveRows.filter((archive) =>
    manageableSet.has(archive.id),
  );

  const filteredRows = data.findings.filter((row) => {
    if (archiveFilter !== "all" && row.finding.archive_id !== archiveFilter) {
      return false;
    }
    if (statusFilter !== "all" && row.finding.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const draftArchive = draft ? archiveMap.get(draft.archive_id) ?? null : null;
  const sourceCandidates = draftArchive
    ? buildGovernanceAssuranceFindingSourceCandidates(draftArchive)
    : [];
  const responsibleCandidates = draftArchive
    ? buildGovernanceAssuranceFindingResponsibleCandidates(draftArchive)
    : [];
  const selectedSource = draft
    ? sourceDetail(draftArchive, draft)
    : null;

  const canSave =
    !!draft &&
    !!draftArchive &&
    manageableSet.has(draft.archive_id) &&
    !!draft.title.trim() &&
    !!draft.description.trim() &&
    (draft.source_type === "manual" || !!draft.source_ref_id) &&
    (
      (draft.status !== "resolved" && draft.status !== "accepted") ||
      !!draft.resolution_note.trim()
    );

  const summaryCards = [
    {
      label: "Critical Active",
      value: data.summary.critical_active,
      className: "text-danger",
      icon: ShieldAlert,
    },
    {
      label: "High Active",
      value: data.summary.high_active,
      className: "text-warning",
      icon: AlertTriangle,
    },
    {
      label: "Overdue Active",
      value: data.summary.overdue_active,
      className: "text-danger",
      icon: CalendarClock,
    },
    {
      label: "Unassigned Active",
      value: data.summary.unassigned_active,
      className: "text-warning",
      icon: UserRoundX,
    },
    {
      label: "Resolved",
      value: data.summary.resolved,
      className: "text-success",
      icon: CheckCircle2,
    },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileWarning className="h-4 w-4 text-brand" />
            Assurance Findings & Remediation Register
          </h3>
          <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
            Findings تُدار بعد الأرشفة ولا تعدّل Archive Certificate.
            Severity وDue Date وResponsible تُحدد صراحةً؛ لا يوجد hidden score.
          </p>
        </div>

        {!!manageableArchives.length && (
          <button
            type="button"
            onClick={() => setDraft(emptyDraft(manageableArchives[0].id))}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-[10px] font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Finding جديد
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2">
                <Icon className={"h-3.5 w-3.5 " + card.className} />
                <p className="text-[8px] text-muted-foreground">
                  {card.label}
                </p>
              </div>
              <p className={"mt-1 text-xl font-bold " + card.className}>
                {arabicNumber(card.value)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-[9px] text-muted-foreground">
          Archive
          <select
            value={archiveFilter}
            onChange={(event) => setArchiveFilter(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="all">كل Archive Certificates</option>
            {archiveRows.map((archive) => (
              <option key={archive.id} value={archive.id}>
                {archive.certificate_code} ·{" "}
                {archive.snapshot.review.period_label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-[9px] text-muted-foreground">
          Status
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | GovernanceAssuranceFindingStatus
                  | "all",
              )
            }
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="all">كل الحالات</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="accepted">Accepted</option>
          </select>
        </label>
      </div>

      {draft && draftArchive && (
        <div className="rounded-2xl border border-brand/20 bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">
                {draft.id ? "تحرير Assurance Finding" : "Assurance Finding جديد"}
              </h4>
              <p className="mt-1 text-[8px] text-muted-foreground">
                {draftArchive.certificate_code} ·{" "}
                {draftArchive.snapshot.review.period_label}
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

          {!draft.id && manageableArchives.length > 1 && (
            <label className="mt-3 block text-[9px] text-muted-foreground">
              Archive Certificate
              <select
                value={draft.archive_id}
                onChange={(event) =>
                  setDraft(emptyDraft(event.target.value))
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                {manageableArchives.map((archive) => (
                  <option key={archive.id} value={archive.id}>
                    {archive.certificate_code} ·{" "}
                    {archive.snapshot.review.period_label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-[9px] text-muted-foreground">
              Source Type
              <select
                value={draft.source_type}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    source_type:
                      event.target.value as GovernanceAssuranceFindingSourceType,
                    source_ref_id: "",
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                <option value="manual">Manual Finding</option>
                <option value="signoff_reservation">
                  Sign-off Reservation
                </option>
                <option value="recipient_acknowledgement">
                  Acknowledgement Note
                </option>
              </select>
            </label>

            {draft.source_type !== "manual" && (
              <label className="text-[9px] text-muted-foreground">
                Archived Source
                <select
                  value={draft.source_ref_id}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      source_ref_id: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
                >
                  <option value="">اختر المصدر المؤرشف</option>
                  {sourceCandidates
                    .filter((row) => row.type === draft.source_type)
                    .map((row) => (
                      <option key={row.ref_id} value={row.ref_id}>
                        {row.label}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {selectedSource && (
              <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground md:col-span-2">
                <strong className="text-foreground">
                  Archived source text:
                </strong>{" "}
                {selectedSource.detail}
              </div>
            )}

            <label className="text-[9px] text-muted-foreground md:col-span-2">
              Finding Title
              <input
                value={draft.title}
                maxLength={240}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              />
            </label>

            <label className="text-[9px] text-muted-foreground md:col-span-2">
              Description
              <textarea
                rows={4}
                maxLength={12000}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-xs"
              />
            </label>

            <label className="text-[9px] text-muted-foreground">
              Severity
              <select
                value={draft.severity}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    severity:
                      event.target.value as GovernanceAssuranceFindingSeverity,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>

            <label className="text-[9px] text-muted-foreground">
              Status
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status:
                      event.target.value as GovernanceAssuranceFindingStatus,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="accepted">Accepted</option>
              </select>
            </label>

            <label className="text-[9px] text-muted-foreground">
              Responsible
              <select
                value={draft.responsible_user_id}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    responsible_user_id: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              >
                <option value="">غير معيّن</option>
                {responsibleCandidates.map((candidate) => (
                  <option key={candidate.user_id} value={candidate.user_id}>
                    {candidate.display_name}
                    {candidate.email ? " · " + candidate.email : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[9px] text-muted-foreground">
              Due Date
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) =>
                  setDraft({ ...draft, due_date: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              />
            </label>

            <label className="text-[9px] text-muted-foreground md:col-span-2">
              Corrective Action
              <textarea
                rows={3}
                maxLength={12000}
                value={draft.corrective_action}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    corrective_action: event.target.value,
                  })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-xs"
              />
            </label>

            {(draft.status === "resolved" ||
              draft.status === "accepted") && (
              <label className="text-[9px] text-muted-foreground md:col-span-2">
                Resolution Note
                <textarea
                  rows={3}
                  maxLength={12000}
                  value={draft.resolution_note}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      resolution_note: event.target.value,
                    })
                  }
                  className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-xs"
                />
                <span className="mt-1 block text-[8px]">
                  مطلوبة عند Resolved أو Accepted.
                </span>
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={!canSave || saveFinding.isPending}
            onClick={() =>
              saveFinding.mutate(
                {
                  id: draft.id,
                  expected_version: draft.expected_version,
                  archive_id: draft.archive_id,
                  source_type: draft.source_type,
                  source_ref_id:
                    draft.source_type === "manual"
                      ? null
                      : draft.source_ref_id,
                  title: draft.title,
                  description: draft.description,
                  severity: draft.severity,
                  status: draft.status,
                  responsible_user_id:
                    draft.responsible_user_id || null,
                  due_date: draft.due_date || null,
                  corrective_action: draft.corrective_action || null,
                  resolution_note: draft.resolution_note || null,
                },
                { onSuccess: () => setDraft(null) },
              )
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {draft.id ? "حفظ Finding" : "إنشاء Finding"}
          </button>
        </div>
      )}

      {!manageableArchives.length && !!archiveRows.length && (
        <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
          لديك View access على Archive/Findings، لكن إنشاء أو تعديل Findings
          متاح لمالك Archive فقط.
        </div>
      )}

      {!filteredRows.length ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-xs text-muted-foreground">
          لا توجد Findings مطابقة للفلاتر الحالية.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map(({ finding, archive, can_manage }) => {
            const active =
              finding.status === "open" ||
              finding.status === "in_progress";
            const overdue =
              active &&
              !!finding.due_date &&
              finding.due_date < todayKey();
            const severityMeta = SEVERITY_META[finding.severity];
            const statusMeta = STATUS_META[finding.status];

            return (
              <div
                key={finding.id}
                className={
                  overdue
                    ? "rounded-xl border border-danger/30 bg-danger/[0.03] p-4"
                    : "rounded-xl border border-border bg-background p-4"
                }
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xs font-semibold">
                        {finding.title}
                      </h4>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[8px] " +
                          severityMeta.className
                        }
                      >
                        {severityMeta.label}
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[8px] " +
                          statusMeta.className
                        }
                      >
                        {statusMeta.label}
                      </span>
                      {overdue && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[8px] font-semibold text-danger">
                          Overdue
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-muted-foreground">
                      {finding.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-muted-foreground">
                      <span>
                        Archive: <strong>{archive.certificate_code}</strong>
                      </span>
                      <span>
                        Source: {SOURCE_LABELS[finding.source_type]}
                      </span>
                      <span>
                        Responsible:{" "}
                        {finding.responsible_name_snapshot ?? "غير معيّن"}
                      </span>
                      <span>
                        Due: {formatDate(finding.due_date)}
                      </span>
                      <span>v{arabicNumber(finding.version)}</span>
                    </div>

                    {finding.corrective_action && (
                      <div className="mt-3 rounded-lg border border-border p-3 text-[8px] leading-4 text-muted-foreground">
                        <strong className="text-foreground">
                          Corrective Action:
                        </strong>{" "}
                        {finding.corrective_action}
                      </div>
                    )}

                    {finding.resolution_note && (
                      <div className="mt-2 rounded-lg border border-success/20 bg-success/5 p-3 text-[8px] leading-4 text-muted-foreground">
                        <strong className="text-success">
                          Resolution:
                        </strong>{" "}
                        {finding.resolution_note}
                      </div>
                    )}
                  </div>

                  {can_manage && (
                    <button
                      type="button"
                      onClick={() => setDraft(editDraft(finding))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileWarning,
  GitBranch,
  Pencil,
  RefreshCw,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Tags,
  UserCheck,
  UserRoundX,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  useGovernanceAssuranceArchives,
} from "@/hooks/use-governance-assurance";
import { ExecutiveGovernanceAssuranceFindingCapa } from "@/components/portfolio/ExecutiveGovernanceAssuranceFindingCapa";
import {
  useActOnGovernanceAssuranceFindingVerification,
  useAddGovernanceAssuranceFindingEvidence,
  useClassifyGovernanceAssuranceFinding,
  useGovernanceAssuranceFindings,
  useRequestGovernanceAssuranceFindingVerification,
  useSaveGovernanceAssuranceFinding,
} from "@/hooks/use-governance-assurance-findings";
import { arabicNumber } from "@/lib/format";
import {
  buildGovernanceAssuranceFindingClosureReadiness,
  buildGovernanceAssuranceFindingResponsibleCandidates,
  buildGovernanceAssuranceFindingSourceCandidates,
  buildGovernanceAssuranceRecurrenceCandidates,
} from "@/services/governance-assurance-findings.service";
import type {
  GovernanceAssuranceArchive,
} from "@/types/governance-assurance";
import type {
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingCategory,
  GovernanceAssuranceFindingEvidenceType,
  GovernanceAssuranceFindingSeverity,
  GovernanceAssuranceFindingSourceType,
  GovernanceAssuranceFindingStatus,
  GovernanceAssuranceFindingVerificationStatus,
  GovernanceAssuranceRootCauseCategory,
} from "@/types/governance-assurance-findings";

interface TaxonomyDraft {
  finding_id: string;
  finding_category: GovernanceAssuranceFindingCategory | "";
  root_cause_category: GovernanceAssuranceRootCauseCategory | "";
  root_cause_detail: string;
  recurrence_parent_finding_id: string;
  recurrence_reason: string;
}

interface EvidenceDraft {
  finding_id: string;
  evidence_type: GovernanceAssuranceFindingEvidenceType;
  title: string;
  detail: string;
  reference_url: string;
}

interface VerificationRequestDraft {
  finding_id: string;
  verifier_user_id: string;
}

interface VerificationActionDraft {
  finding_id: string;
  decision: Extract<
    GovernanceAssuranceFindingVerificationStatus,
    "effective" | "partially_effective" | "ineffective"
  >;
  effectiveness_note: string;
}

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
  reminder_date: string;
  corrective_action: string;
  resolution_note: string;
}

const CATEGORY_LABELS: Record<
  GovernanceAssuranceFindingCategory,
  string
> = {
  control_design: "Control Design",
  control_operation: "Control Operation",
  process_gap: "Process Gap",
  data_quality: "Data Quality",
  compliance: "Compliance",
  governance: "Governance",
  security_access: "Security / Access",
  documentation: "Documentation",
  execution: "Execution",
  third_party: "Third Party",
  other: "Other",
};

const ROOT_CAUSE_LABELS: Record<
  GovernanceAssuranceRootCauseCategory,
  string
> = {
  people: "People",
  process: "Process",
  technology: "Technology",
  data: "Data",
  governance: "Governance",
  third_party: "Third Party",
  external: "External",
  unknown: "Unknown",
  other: "Other",
};

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

const VERIFICATION_META: Record<
  GovernanceAssuranceFindingVerificationStatus,
  { label: string; className: string }
> = {
  not_requested: {
    label: "Not Requested",
    className: "bg-muted text-muted-foreground",
  },
  pending: {
    label: "Verification Pending",
    className: "bg-info/10 text-info",
  },
  effective: {
    label: "Effective",
    className: "bg-success/10 text-success",
  },
  partially_effective: {
    label: "Partially Effective",
    className: "bg-warning/10 text-warning",
  },
  ineffective: {
    label: "Ineffective",
    className: "bg-danger/10 text-danger",
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
    reminder_date: "",
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
    reminder_date: finding.reminder_date ?? "",
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
  const classifyFinding = useClassifyGovernanceAssuranceFinding();
  const addEvidence = useAddGovernanceAssuranceFindingEvidence();
  const requestVerification =
    useRequestGovernanceAssuranceFindingVerification();
  const actVerification =
    useActOnGovernanceAssuranceFindingVerification();
  const [draft, setDraft] = useState<FindingDraft | null>(null);
  const [taxonomyDraft, setTaxonomyDraft] =
    useState<TaxonomyDraft | null>(null);
  const [evidenceDraft, setEvidenceDraft] =
    useState<EvidenceDraft | null>(null);
  const [verificationRequest, setVerificationRequest] =
    useState<VerificationRequestDraft | null>(null);
  const [verificationAction, setVerificationAction] =
    useState<VerificationActionDraft | null>(null);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    GovernanceAssuranceFindingStatus | "all"
  >("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "assigned_to_me">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<
    GovernanceAssuranceFindingCategory | "all" | "unclassified"
  >("all");
  const [recurrenceFilter, setRecurrenceFilter] = useState<
    "all" | "recurring" | "original"
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
      assigned_to_me_active: 0,
      verification_pending: 0,
      ineffective_active: 0,
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
    if (scopeFilter === "assigned_to_me" && !row.is_responsible) {
      return false;
    }
    if (
      categoryFilter === "unclassified" &&
      row.finding.finding_category
    ) {
      return false;
    }
    if (
      categoryFilter !== "all" &&
      categoryFilter !== "unclassified" &&
      row.finding.finding_category !== categoryFilter
    ) {
      return false;
    }
    if (
      recurrenceFilter === "recurring" &&
      !row.finding.recurrence_parent_finding_id
    ) {
      return false;
    }
    if (
      recurrenceFilter === "original" &&
      row.finding.recurrence_parent_finding_id
    ) {
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

  const draftRow = draft?.id
    ? data.findings.find((row) => row.finding.id === draft.id) ?? null
    : null;
  const draftHasEvidence = (draftRow?.evidence.length ?? 0) > 0;

  const canSave =
    !!draft &&
    !!draftArchive &&
    manageableSet.has(draft.archive_id) &&
    !!draft.title.trim() &&
    !!draft.description.trim() &&
    (draft.source_type === "manual" || !!draft.source_ref_id) &&
    (
      !draft.reminder_date ||
      (!!draft.due_date && draft.reminder_date <= draft.due_date)
    ) &&
    (
      (draft.status !== "resolved" && draft.status !== "accepted") ||
      !!draft.resolution_note.trim()
    ) &&
    (
      draft.status !== "resolved" ||
      (!!draft.id && draftHasEvidence)
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
      label: "Assigned to Me",
      value: data.summary.assigned_to_me_active,
      className: "text-brand",
      icon: UserCheck,
    },
    {
      label: "Verification Pending",
      value: data.summary.verification_pending,
      className: "text-info",
      icon: RefreshCw,
    },
    {
      label: "Ineffective Active",
      value: data.summary.ineffective_active,
      className: "text-danger",
      icon: ShieldAlert,
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[9px] text-muted-foreground">
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
        <label className="text-[9px] text-muted-foreground">
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
        <label className="text-[9px] text-muted-foreground">
          Responsibility
          <select
            value={scopeFilter}
            onChange={(event) =>
              setScopeFilter(
                event.target.value as "all" | "assigned_to_me",
              )
            }
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="all">كل Findings المرئية</option>
            <option value="assigned_to_me">Assigned to Me</option>
          </select>
        </label>

        <label className="text-[9px] text-muted-foreground">
          Category
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(
                event.target.value as
                  | GovernanceAssuranceFindingCategory
                  | "all"
                  | "unclassified",
              )
            }
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="all">كل Categories</option>
            <option value="unclassified">Unclassified</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[9px] text-muted-foreground">
          Recurrence
          <select
            value={recurrenceFilter}
            onChange={(event) =>
              setRecurrenceFilter(
                event.target.value as
                  | "all"
                  | "recurring"
                  | "original",
              )
            }
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="all">كل Findings</option>
            <option value="recurring">Recurring فقط</option>
            <option value="original">غير مرتبطة كسجل متكرر</option>
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
                  setDraft({
                    ...draft,
                    due_date: event.target.value,
                    reminder_date:
                      draft.reminder_date &&
                      event.target.value &&
                      draft.reminder_date > event.target.value
                        ? ""
                        : draft.reminder_date,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs"
              />
            </label>

            <label className="text-[9px] text-muted-foreground">
              Reminder Date
              <input
                type="date"
                max={draft.due_date || undefined}
                disabled={!draft.due_date}
                value={draft.reminder_date}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    reminder_date: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs disabled:opacity-50"
              />
              <span className="mt-1 block text-[8px]">
                اختيارية، ولا توجد نافذة تذكير افتراضية.
              </span>
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
                  {draft.status === "resolved" && !draftHasEvidence
                    ? " أضف Closure Evidence أولًا."
                    : ""}
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
                  reminder_date: draft.reminder_date || null,
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
          {filteredRows.map(({ finding, archive, can_manage, is_responsible, can_verify, evidence, actions }) => {
            const active =
              finding.status === "open" ||
              finding.status === "in_progress";
            const overdue =
              active &&
              !!finding.due_date &&
              finding.due_date < todayKey();
            const severityMeta = SEVERITY_META[finding.severity];
            const statusMeta = STATUS_META[finding.status];
            const verificationMeta =
              VERIFICATION_META[finding.verification_status];
            const verifierCandidates =
              buildGovernanceAssuranceFindingResponsibleCandidates(
                archive,
              ).filter(
                (candidate) =>
                  candidate.user_id !== finding.responsible_user_id,
              );
            const recurrenceParent =
              finding.recurrence_parent_finding_id
                ? data.findings.find(
                    (row) =>
                      row.finding.id ===
                      finding.recurrence_parent_finding_id,
                  ) ?? null
                : null;
            const editingTaxonomy =
              taxonomyDraft?.finding_id === finding.id;
            const recurrenceCandidates = editingTaxonomy
              ? buildGovernanceAssuranceRecurrenceCandidates(
                  data,
                  finding.id,
                  taxonomyDraft.finding_category || null,
                  taxonomyDraft.root_cause_category || null,
                )
              : [];
            const closureReadiness =
              buildGovernanceAssuranceFindingClosureReadiness({
                finding,
                archive,
                can_manage,
                is_responsible,
                can_verify,
                evidence,
                actions,
              });

            return (
              <div
                key={finding.id}
                id={"assurance-finding-" + finding.id}
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
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[8px] " +
                          verificationMeta.className
                        }
                      >
                        {verificationMeta.label}
                      </span>
                      {finding.finding_category && (
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[8px] text-brand">
                          {CATEGORY_LABELS[finding.finding_category]}
                        </span>
                      )}
                      {finding.root_cause_category && (
                        <span className="rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info">
                          Root:{" "}
                          {ROOT_CAUSE_LABELS[
                            finding.root_cause_category
                          ]}
                        </span>
                      )}
                      {finding.recurrence_parent_finding_id && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[8px] font-semibold text-warning">
                          Recurring #{arabicNumber(finding.recurrence_sequence)}
                        </span>
                      )}
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
                      <span>
                        Reminder: {formatDate(finding.reminder_date)}
                      </span>
                      <span>
                        Evidence: {arabicNumber(evidence.length)}
                      </span>
                      <span>
                        Verifier: {finding.verifier_name_snapshot ?? "—"}
                      </span>
                      <span>
                        Classified: {formatDate(finding.classified_at)}
                      </span>
                      <span>Taxonomy v{arabicNumber(finding.taxonomy_version)}</span>
                      <span>v{arabicNumber(finding.version)}</span>
                    </div>

                    {(finding.finding_category ||
                      finding.root_cause_category ||
                      finding.recurrence_parent_finding_id) && (
                      <div className="mt-3 rounded-xl border border-brand/15 bg-brand/[0.025] p-3 text-[8px] leading-4 text-muted-foreground">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            Category:{" "}
                            <strong className="text-foreground">
                              {finding.finding_category
                                ? CATEGORY_LABELS[
                                    finding.finding_category
                                  ]
                                : "—"}
                            </strong>
                          </span>
                          <span>
                            Root Cause:{" "}
                            <strong className="text-foreground">
                              {finding.root_cause_category
                                ? ROOT_CAUSE_LABELS[
                                    finding.root_cause_category
                                  ]
                                : "—"}
                            </strong>
                          </span>
                        </div>
                        {finding.root_cause_detail && (
                          <p className="mt-2 whitespace-pre-wrap">
                            <strong className="text-foreground">
                              Root Cause Detail:
                            </strong>{" "}
                            {finding.root_cause_detail}
                          </p>
                        )}
                        {finding.recurrence_parent_finding_id && (
                          <div className="mt-2 rounded-lg border border-warning/20 bg-warning/5 p-2">
                            <p>
                              <strong className="text-warning">
                                Recurrence chain #{arabicNumber(
                                  finding.recurrence_sequence,
                                )}
                              </strong>
                              {" · Previous: "}
                              {recurrenceParent
                                ? recurrenceParent.archive.certificate_code +
                                  " · " +
                                  recurrenceParent.finding.title
                                : "Finding سابقة غير ظاهرة في نطاقك الحالي"}
                            </p>
                            {finding.recurrence_reason && (
                              <p className="mt-1 whitespace-pre-wrap">
                                <strong className="text-foreground">
                                  Reason:
                                </strong>{" "}
                                {finding.recurrence_reason}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {finding.corrective_action && (
                      <div className="mt-3 rounded-lg border border-border p-3 text-[8px] leading-4 text-muted-foreground">
                        <strong className="text-foreground">
                          Corrective Action:
                        </strong>{" "}
                        {finding.corrective_action}
                      </div>
                    )}

                    <ExecutiveGovernanceAssuranceFindingCapa
                      finding={finding}
                      archive={archive}
                      canManage={can_manage}
                      actions={actions}
                      readiness={closureReadiness}
                    />

                    {finding.resolution_note && (
                      <div className="mt-2 rounded-lg border border-success/20 bg-success/5 p-3 text-[8px] leading-4 text-muted-foreground">
                        <strong className="text-success">
                          Resolution:
                        </strong>{" "}
                        {finding.resolution_note}
                      </div>
                    )}

                    {finding.effectiveness_note && (
                      <div
                        className={
                          finding.verification_status === "effective"
                            ? "mt-2 rounded-lg border border-success/20 bg-success/5 p-3 text-[8px] leading-4 text-muted-foreground"
                            : "mt-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-[8px] leading-4 text-muted-foreground"
                        }
                      >
                        <strong className="text-foreground">
                          Effectiveness Review:
                        </strong>{" "}
                        {finding.effectiveness_note}
                      </div>
                    )}

                    {!!evidence.length && (
                      <div className="mt-3 rounded-xl border border-border p-3">
                        <p className="text-[9px] font-semibold">
                          Closure Evidence
                        </p>
                        <div className="mt-2 space-y-2">
                          {evidence.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg bg-muted/30 p-2 text-[8px] leading-4 text-muted-foreground"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-foreground">
                                  {item.title}
                                </strong>
                                <span className="rounded-full bg-background px-2 py-0.5">
                                  {item.evidence_type}
                                </span>
                                <span>{formatDate(item.created_at)}</span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap">
                                {item.detail}
                              </p>
                              {item.reference_url && (
                                <a
                                  href={item.reference_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-block break-all text-brand underline"
                                >
                                  {item.reference_url}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {can_manage &&
                      finding.verification_status !== "pending" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTaxonomyDraft({
                              finding_id: finding.id,
                              finding_category:
                                finding.finding_category ?? "",
                              root_cause_category:
                                finding.root_cause_category ?? "",
                              root_cause_detail:
                                finding.root_cause_detail ?? "",
                              recurrence_parent_finding_id:
                                finding.recurrence_parent_finding_id ?? "",
                              recurrence_reason:
                                finding.recurrence_reason ?? "",
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                        >
                          <Tags className="h-3.5 w-3.5" />
                          Taxonomy & Recurrence
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEvidenceDraft({
                              finding_id: finding.id,
                              evidence_type: "note",
                              title: "",
                              detail: "",
                              reference_url: "",
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                          Add Evidence
                        </button>

                        {finding.status === "resolved" &&
                          finding.verification_status === "not_requested" &&
                          closureReadiness.ready && (
                            <button
                              type="button"
                              onClick={() =>
                                setVerificationRequest({
                                  finding_id: finding.id,
                                  verifier_user_id: "",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Request Effectiveness Review
                            </button>
                          )}
                      </div>
                    )}

                    {editingTaxonomy && taxonomyDraft && (
                      <div className="mt-3 rounded-xl border border-brand/20 bg-card p-3">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-brand" />
                          <div>
                            <p className="text-[9px] font-semibold">
                              Taxonomy, Root Cause & Recurrence
                            </p>
                            <p className="text-[8px] text-muted-foreground">
                              Recurrence candidates are sorted only by explicit taxonomy.
                              No text similarity or AI score is used.
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <label className="text-[8px] text-muted-foreground">
                            Finding Category
                            <select
                              value={taxonomyDraft.finding_category}
                              onChange={(event) => {
                                const value =
                                  event.target.value as
                                    | GovernanceAssuranceFindingCategory
                                    | "";
                                setTaxonomyDraft({
                                  ...taxonomyDraft,
                                  finding_category: value,
                                  root_cause_category: value
                                    ? taxonomyDraft.root_cause_category
                                    : "",
                                  root_cause_detail: value
                                    ? taxonomyDraft.root_cause_detail
                                    : "",
                                });
                              }}
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                            >
                              <option value="">Unclassified</option>
                              {Object.entries(CATEGORY_LABELS).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          <label className="text-[8px] text-muted-foreground">
                            Root Cause
                            <select
                              disabled={!taxonomyDraft.finding_category}
                              value={taxonomyDraft.root_cause_category}
                              onChange={(event) =>
                                setTaxonomyDraft({
                                  ...taxonomyDraft,
                                  root_cause_category:
                                    event.target.value as
                                      | GovernanceAssuranceRootCauseCategory
                                      | "",
                                  root_cause_detail:
                                    event.target.value
                                      ? taxonomyDraft.root_cause_detail
                                      : "",
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px] disabled:opacity-50"
                            >
                              <option value="">Not specified</option>
                              {Object.entries(ROOT_CAUSE_LABELS).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          {taxonomyDraft.root_cause_category && (
                            <label className="text-[8px] text-muted-foreground md:col-span-2">
                              Root Cause Detail
                              <textarea
                                rows={3}
                                maxLength={4000}
                                value={taxonomyDraft.root_cause_detail}
                                onChange={(event) =>
                                  setTaxonomyDraft({
                                    ...taxonomyDraft,
                                    root_cause_detail:
                                      event.target.value,
                                  })
                                }
                                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                              />
                            </label>
                          )}

                          <label className="text-[8px] text-muted-foreground md:col-span-2">
                            Previous Finding in Recurrence Chain
                            <select
                              value={
                                taxonomyDraft.recurrence_parent_finding_id
                              }
                              onChange={(event) =>
                                setTaxonomyDraft({
                                  ...taxonomyDraft,
                                  recurrence_parent_finding_id:
                                    event.target.value,
                                  recurrence_reason:
                                    event.target.value
                                      ? taxonomyDraft.recurrence_reason
                                      : "",
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                            >
                              <option value="">
                                ليست Recurrence مرتبطة بسجل سابق
                              </option>
                              {recurrenceCandidates.map((candidate) => (
                                <option
                                  key={candidate.finding_id}
                                  value={candidate.finding_id}
                                >
                                  {candidate.match === "exact_taxonomy"
                                    ? "Exact taxonomy · "
                                    : candidate.match === "same_category"
                                      ? "Same category · "
                                      : "Previous archive · "}
                                  {candidate.certificate_code} ·{" "}
                                  {candidate.title}
                                </option>
                              ))}
                            </select>
                            <span className="mt-1 block text-[8px]">
                              يظهر فقط Findings من Archive أقدم. ترتيب المرشحين
                              لا ينشئ Recurrence تلقائيًا.
                            </span>
                          </label>

                          {taxonomyDraft.recurrence_parent_finding_id && (
                            <label className="text-[8px] text-muted-foreground md:col-span-2">
                              Recurrence Reason
                              <textarea
                                rows={3}
                                maxLength={4000}
                                value={taxonomyDraft.recurrence_reason}
                                onChange={(event) =>
                                  setTaxonomyDraft({
                                    ...taxonomyDraft,
                                    recurrence_reason:
                                      event.target.value,
                                  })
                                }
                                placeholder="اشرح لماذا تعتبر هذه Finding تكرارًا للسجل السابق."
                                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                              />
                            </label>
                          )}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={
                              classifyFinding.isPending ||
                              (
                                !!taxonomyDraft.root_cause_category &&
                                !taxonomyDraft.finding_category
                              ) ||
                              (
                                !!taxonomyDraft.root_cause_detail.trim() &&
                                !taxonomyDraft.root_cause_category
                              ) ||
                              (
                                !!taxonomyDraft.recurrence_parent_finding_id &&
                                !taxonomyDraft.recurrence_reason.trim()
                              )
                            }
                            onClick={() =>
                              classifyFinding.mutate(
                                {
                                  finding_id: finding.id,
                                  expected_version: finding.version,
                                  finding_category:
                                    taxonomyDraft.finding_category || null,
                                  root_cause_category:
                                    taxonomyDraft.root_cause_category || null,
                                  root_cause_detail:
                                    taxonomyDraft.root_cause_detail || null,
                                  recurrence_parent_finding_id:
                                    taxonomyDraft.recurrence_parent_finding_id ||
                                    null,
                                  recurrence_reason:
                                    taxonomyDraft.recurrence_reason || null,
                                },
                                {
                                  onSuccess: () =>
                                    setTaxonomyDraft(null),
                                },
                              )
                            }
                            className="rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                          >
                            حفظ Taxonomy
                          </button>
                          <button
                            type="button"
                            onClick={() => setTaxonomyDraft(null)}
                            className="rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}

                    {evidenceDraft?.finding_id === finding.id && (
                      <div className="mt-3 rounded-xl border border-brand/20 bg-card p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="text-[8px] text-muted-foreground">
                            Evidence Type
                            <select
                              value={evidenceDraft.evidence_type}
                              onChange={(event) =>
                                setEvidenceDraft({
                                  ...evidenceDraft,
                                  evidence_type:
                                    event.target
                                      .value as GovernanceAssuranceFindingEvidenceType,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                            >
                              <option value="note">Note</option>
                              <option value="link">Link</option>
                              <option value="reference">Reference</option>
                            </select>
                          </label>
                          <label className="text-[8px] text-muted-foreground">
                            Title
                            <input
                              value={evidenceDraft.title}
                              maxLength={240}
                              onChange={(event) =>
                                setEvidenceDraft({
                                  ...evidenceDraft,
                                  title: event.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                            />
                          </label>
                          <label className="text-[8px] text-muted-foreground md:col-span-2">
                            Detail
                            <textarea
                              rows={3}
                              maxLength={12000}
                              value={evidenceDraft.detail}
                              onChange={(event) =>
                                setEvidenceDraft({
                                  ...evidenceDraft,
                                  detail: event.target.value,
                                })
                              }
                              className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                            />
                          </label>
                          {(evidenceDraft.evidence_type === "link" ||
                            evidenceDraft.reference_url) && (
                            <label className="text-[8px] text-muted-foreground md:col-span-2">
                              Reference URL
                              <input
                                type="url"
                                maxLength={2000}
                                value={evidenceDraft.reference_url}
                                onChange={(event) =>
                                  setEvidenceDraft({
                                    ...evidenceDraft,
                                    reference_url: event.target.value,
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                              />
                            </label>
                          )}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={
                              addEvidence.isPending ||
                              !evidenceDraft.title.trim() ||
                              !evidenceDraft.detail.trim() ||
                              (evidenceDraft.evidence_type === "link" &&
                                !evidenceDraft.reference_url.trim()) ||
                              (
                                !!evidenceDraft.reference_url.trim() &&
                                !/^https?:\/\//i.test(
                                  evidenceDraft.reference_url.trim(),
                                )
                              )
                            }
                            onClick={() =>
                              addEvidence.mutate(
                                {
                                  finding_id: finding.id,
                                  evidence_type:
                                    evidenceDraft.evidence_type,
                                  title: evidenceDraft.title,
                                  detail: evidenceDraft.detail,
                                  reference_url:
                                    evidenceDraft.reference_url || null,
                                },
                                {
                                  onSuccess: () =>
                                    setEvidenceDraft(null),
                                },
                              )
                            }
                            className="rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                          >
                            حفظ Evidence
                          </button>
                          <button
                            type="button"
                            onClick={() => setEvidenceDraft(null)}
                            className="rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}

                    {verificationRequest?.finding_id === finding.id && (
                      <div className="mt-3 rounded-xl border border-info/20 bg-info/5 p-3">
                        <p className="text-[9px] font-semibold">
                          Independent Verifier
                        </p>
                        <select
                          value={verificationRequest.verifier_user_id}
                          onChange={(event) =>
                            setVerificationRequest({
                              ...verificationRequest,
                              verifier_user_id: event.target.value,
                            })
                          }
                          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                        >
                          <option value="">اختر Verifier</option>
                          {verifierCandidates.map((candidate) => (
                            <option
                              key={candidate.user_id}
                              value={candidate.user_id}
                            >
                              {candidate.display_name}
                              {candidate.email
                                ? " · " + candidate.email
                                : ""}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[8px] text-muted-foreground">
                          Responsible مستبعدة من قائمة Verifier.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={
                              requestVerification.isPending ||
                              !verificationRequest.verifier_user_id
                            }
                            onClick={() =>
                              requestVerification.mutate(
                                {
                                  finding_id: finding.id,
                                  expected_version: finding.version,
                                  verifier_user_id:
                                    verificationRequest.verifier_user_id,
                                },
                                {
                                  onSuccess: () =>
                                    setVerificationRequest(null),
                                },
                              )
                            }
                            className="rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                          >
                            إرسال للـVerifier
                          </button>
                          <button
                            type="button"
                            onClick={() => setVerificationRequest(null)}
                            className="rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}

                    {finding.verification_status === "pending" && (
                      <div className="mt-3 rounded-xl border border-info/20 bg-info/5 p-3 text-[8px] leading-4 text-muted-foreground">
                        Effectiveness Review pending with{" "}
                        <strong className="text-foreground">
                          {finding.verifier_name_snapshot ?? "Verifier"}
                        </strong>
                        {" · Requested "}
                        {formatDate(finding.verification_requested_at)}
                      </div>
                    )}

                    {can_verify && (
                      <div className="mt-3 rounded-xl border border-brand/20 bg-card p-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-brand" />
                          <p className="text-[9px] font-semibold">
                            My Effectiveness Review
                          </p>
                        </div>

                        {verificationAction?.finding_id !== finding.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              setVerificationAction({
                                finding_id: finding.id,
                                decision: "effective",
                                effectiveness_note: "",
                              })
                            }
                            className="mt-3 rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground"
                          >
                            بدء التحقق
                          </button>
                        ) : (
                          <>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              {(
                                [
                                  ["effective", "Effective"],
                                  [
                                    "partially_effective",
                                    "Partially Effective",
                                  ],
                                  ["ineffective", "Ineffective"],
                                ] as const
                              ).map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() =>
                                    setVerificationAction({
                                      ...verificationAction,
                                      decision: value,
                                    })
                                  }
                                  className={
                                    verificationAction.decision === value
                                      ? "rounded-lg border border-brand bg-brand/10 px-2 py-2 text-[8px] font-semibold text-brand"
                                      : "rounded-lg border border-border px-2 py-2 text-[8px] text-muted-foreground hover:bg-muted"
                                  }
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <textarea
                              rows={3}
                              maxLength={12000}
                              value={
                                verificationAction.effectiveness_note
                              }
                              onChange={(event) =>
                                setVerificationAction({
                                  ...verificationAction,
                                  effectiveness_note:
                                    event.target.value,
                                })
                              }
                              placeholder="Effectiveness Note — مطلوبة"
                              className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[10px]"
                            />
                            <p className="mt-1 text-[8px] text-muted-foreground">
                              Partially Effective أو Ineffective تعيد
                              Finding إلى In Progress تلقائيًا.
                            </p>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={
                                  actVerification.isPending ||
                                  !verificationAction.effectiveness_note.trim()
                                }
                                onClick={() =>
                                  actVerification.mutate(
                                    {
                                      finding_id: finding.id,
                                      expected_version: finding.version,
                                      decision:
                                        verificationAction.decision,
                                      effectiveness_note:
                                        verificationAction.effectiveness_note,
                                    },
                                    {
                                      onSuccess: () =>
                                        setVerificationAction(null),
                                    },
                                  )
                                }
                                className="rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                              >
                                تسجيل نتيجة التحقق
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setVerificationAction(null)
                                }
                                className="rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                              >
                                إلغاء
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {can_manage &&
                    finding.verification_status !== "pending" && (
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

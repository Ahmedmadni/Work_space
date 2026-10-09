import {
  CalendarClock,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";

import { useSaveGovernanceAssuranceFindingAction } from "@/hooks/use-governance-assurance-findings";
import { arabicNumber } from "@/lib/format";
import { buildGovernanceAssuranceFindingResponsibleCandidates } from "@/services/governance-assurance-findings.service";
import type { GovernanceAssuranceArchive } from "@/types/governance-assurance";
import type {
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingAction,
  GovernanceAssuranceFindingActionStatus,
  GovernanceAssuranceFindingActionType,
} from "@/types/governance-assurance-findings";

interface Props {
  finding: GovernanceAssuranceFinding;
  archive: GovernanceAssuranceArchive;
  canManage: boolean;
  actions: GovernanceAssuranceFindingAction[];
}

interface ActionDraft {
  id: string | null;
  expected_version: number | null;
  action_type: GovernanceAssuranceFindingActionType;
  title: string;
  description: string;
  status: GovernanceAssuranceFindingActionStatus;
  responsible_user_id: string;
  due_date: string;
  outcome_note: string;
}

const STATUS_META: Record<
  GovernanceAssuranceFindingActionStatus,
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
  completed: {
    label: "Completed",
    className: "bg-success/10 text-success",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
};

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
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(new Date(value + (value.length === 10 ? "T12:00:00Z" : "")));
}

function newDraft(): ActionDraft {
  return {
    id: null,
    expected_version: null,
    action_type: "corrective",
    title: "",
    description: "",
    status: "open",
    responsible_user_id: "",
    due_date: "",
    outcome_note: "",
  };
}

function editDraft(action: GovernanceAssuranceFindingAction): ActionDraft {
  return {
    id: action.id,
    expected_version: action.version,
    action_type: action.action_type,
    title: action.title,
    description: action.description,
    status: action.status,
    responsible_user_id: action.responsible_user_id ?? "",
    due_date: action.due_date ?? "",
    outcome_note: action.outcome_note ?? "",
  };
}

export function ExecutiveGovernanceAssuranceFindingCapa({
  finding,
  archive,
  canManage,
  actions,
}: Props) {
  const saveAction = useSaveGovernanceAssuranceFindingAction();
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const responsibleCandidates =
    buildGovernanceAssuranceFindingResponsibleCandidates(archive);
  const active = actions.filter(
    (row) => row.status === "open" || row.status === "in_progress",
  );
  const overdue = active.filter(
    (row) => !!row.due_date && row.due_date < todayKey(),
  );
  const preventive = actions.filter(
    (row) =>
      row.action_type === "preventive" && row.status !== "cancelled",
  );
  const locked = finding.verification_status === "pending";

  const canSave =
    !!draft &&
    !!draft.title.trim() &&
    !!draft.description.trim() &&
    (
      (draft.status !== "completed" && draft.status !== "cancelled") ||
      !!draft.outcome_note.trim()
    ) &&
    (
      (draft.status === "completed" || draft.status === "cancelled") ||
      !draft.outcome_note.trim()
    );

  return (
    <div className="mt-3 rounded-xl border border-border bg-card/50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-brand" />
            <p className="text-[9px] font-semibold">
              Structured CAPA Plan
            </p>
          </div>
          <p className="mt-1 text-[8px] leading-4 text-muted-foreground">
            Corrective Action يعالج الحالة الحالية، وPreventive Action يستهدف
            منع التكرار. النص الحر القديم يبقى كسرد ولا يستبدل هذه الخطة.
          </p>
        </div>

        {canManage && !locked && (
          <button
            type="button"
            onClick={() => setDraft(newDraft())}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            CAPA Action
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-2">
          <p className="text-[8px] text-muted-foreground">Active Actions</p>
          <p className="mt-1 text-sm font-bold">
            {arabicNumber(active.length)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-2">
          <p className="text-[8px] text-muted-foreground">Overdue</p>
          <p className="mt-1 text-sm font-bold text-danger">
            {arabicNumber(overdue.length)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-2">
          <p className="text-[8px] text-muted-foreground">
            Preventive Actions
          </p>
          <p className="mt-1 text-sm font-bold text-brand">
            {arabicNumber(preventive.length)}
          </p>
        </div>
      </div>

      {locked && (
        <div className="mt-3 rounded-lg border border-info/20 bg-info/5 p-2 text-[8px] leading-4 text-muted-foreground">
          CAPA Plan مقفلة أثناء Effectiveness Review Pending حتى تبقى مادة
          التحقق ثابتة.
        </div>
      )}

      {draft && (
        <div className="mt-3 rounded-xl border border-brand/20 bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[9px] font-semibold">
              {draft.id ? "تحرير CAPA Action" : "CAPA Action جديدة"}
            </p>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="text-[8px] text-muted-foreground">
              Action Type
              <select
                value={draft.action_type}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    action_type:
                      event.target.value as GovernanceAssuranceFindingActionType,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
              >
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
              </select>
            </label>

            <label className="text-[8px] text-muted-foreground">
              Status
              <select
                value={draft.status}
                onChange={(event) => {
                  const status =
                    event.target.value as GovernanceAssuranceFindingActionStatus;
                  setDraft({
                    ...draft,
                    status,
                    outcome_note:
                      status === "completed" || status === "cancelled"
                        ? draft.outcome_note
                        : "",
                  });
                }}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label className="text-[8px] text-muted-foreground md:col-span-2">
              Title
              <input
                value={draft.title}
                maxLength={240}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
              />
            </label>

            <label className="text-[8px] text-muted-foreground md:col-span-2">
              Description
              <textarea
                rows={3}
                maxLength={12000}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
              />
            </label>

            <label className="text-[8px] text-muted-foreground">
              Responsible
              <select
                value={draft.responsible_user_id}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    responsible_user_id: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
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

            <label className="text-[8px] text-muted-foreground">
              Due Date
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) =>
                  setDraft({ ...draft, due_date: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
              />
            </label>

            {(draft.status === "completed" ||
              draft.status === "cancelled") && (
              <label className="text-[8px] text-muted-foreground md:col-span-2">
                Outcome Note
                <textarea
                  rows={3}
                  maxLength={12000}
                  value={draft.outcome_note}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      outcome_note: event.target.value,
                    })
                  }
                  className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
                />
                <span className="mt-1 block text-[8px]">
                  مطلوبة عند Completed أو Cancelled.
                </span>
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={!canSave || saveAction.isPending || locked}
            onClick={() =>
              saveAction.mutate(
                {
                  id: draft.id,
                  expected_version: draft.expected_version,
                  finding_id: finding.id,
                  action_type: draft.action_type,
                  title: draft.title,
                  description: draft.description,
                  status: draft.status,
                  responsible_user_id:
                    draft.responsible_user_id || null,
                  due_date: draft.due_date || null,
                  outcome_note:
                    draft.status === "completed" ||
                    draft.status === "cancelled"
                      ? draft.outcome_note
                      : null,
                },
                { onSuccess: () => setDraft(null) },
              )
            }
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            حفظ CAPA Action
          </button>
        </div>
      )}

      {!actions.length ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-[8px] text-muted-foreground">
          لا توجد Structured CAPA Actions لهذه Finding حتى الآن.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {actions.map((action) => {
            const actionActive =
              action.status === "open" || action.status === "in_progress";
            const actionOverdue =
              actionActive &&
              !!action.due_date &&
              action.due_date < todayKey();
            const statusMeta = STATUS_META[action.status];

            return (
              <div
                key={action.id}
                className={
                  actionOverdue
                    ? "rounded-lg border border-danger/25 bg-danger/[0.025] p-3"
                    : "rounded-lg border border-border p-3"
                }
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {action.action_type === "preventive" ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <strong className="text-[9px]">
                        {action.title}
                      </strong>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[8px]">
                        {action.action_type === "preventive"
                          ? "Preventive"
                          : "Corrective"}
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[8px] " +
                          statusMeta.className
                        }
                      >
                        {statusMeta.label}
                      </span>
                      {actionOverdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger">
                          <CalendarClock className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-[8px] leading-4 text-muted-foreground">
                      {action.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-muted-foreground">
                      <span>
                        Responsible:{" "}
                        {action.responsible_name_snapshot ?? "غير معيّن"}
                      </span>
                      <span>Due: {formatDate(action.due_date)}</span>
                      <span>v{arabicNumber(action.version)}</span>
                    </div>

                    {action.outcome_note && (
                      <div className="mt-2 rounded-lg border border-success/15 bg-success/[0.025] p-2 text-[8px] leading-4 text-muted-foreground">
                        <strong className="text-foreground">
                          Outcome:
                        </strong>{" "}
                        {action.outcome_note}
                      </div>
                    )}
                  </div>

                  {canManage && !locked && (
                    <button
                      type="button"
                      onClick={() => setDraft(editDraft(action))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[8px] hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" />
                      تعديل
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Gavel,
  Link2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useSaveProjectDecision,
  useSaveProjectRisk,
} from "@/hooks/use-action-center";
import { arabicNumber } from "@/lib/format";
import type {
  BoardWithContext,
  ProjectExecutionSummary,
} from "@/types";
import type {
  ProjectActionCenterData,
  ProjectDecision,
  ProjectDecisionStatus,
  ProjectRisk,
  ProjectRiskSeverity,
  ProjectRiskStatus,
} from "@/types/action-center";
import type { ProjectCollaborator } from "@/types/collaboration";

const RISK_SEVERITY: Record<
  ProjectRiskSeverity,
  { label: string; className: string; rank: number }
> = {
  critical: {
    label: "حرج",
    className: "bg-danger/10 text-danger",
    rank: 0,
  },
  high: {
    label: "مرتفع",
    className: "bg-warning/10 text-warning",
    rank: 1,
  },
  medium: {
    label: "متوسط",
    className: "bg-info/10 text-info",
    rank: 2,
  },
  low: {
    label: "منخفض",
    className: "bg-muted text-muted-foreground",
    rank: 3,
  },
};

const RISK_STATUS: Record<ProjectRiskStatus, string> = {
  open: "مفتوح",
  mitigating: "قيد المعالجة",
  accepted: "مقبول",
  closed: "مغلق",
};

const DECISION_STATUS: Record<ProjectDecisionStatus, string> = {
  proposed: "بانتظار القرار",
  decided: "تم اتخاذ القرار",
  superseded: "تم استبداله",
  cancelled: "ملغى",
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
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
  }).format(new Date(value));
}

interface RiskDraft {
  id: string | null;
  expected_version: number | null;
  title: string;
  description: string;
  severity: ProjectRiskSeverity;
  status: ProjectRiskStatus;
  owner_user_id: string;
  mitigation: string;
  due_date: string;
  node_key: string;
}

interface DecisionDraft {
  id: string | null;
  expected_version: number | null;
  title: string;
  decision: string;
  rationale: string;
  status: ProjectDecisionStatus;
  owner_user_id: string;
  node_key: string;
}

const EMPTY_RISK: RiskDraft = {
  id: null,
  expected_version: null,
  title: "",
  description: "",
  severity: "medium",
  status: "open",
  owner_user_id: "",
  mitigation: "",
  due_date: "",
  node_key: "",
};

const EMPTY_DECISION: DecisionDraft = {
  id: null,
  expected_version: null,
  title: "",
  decision: "",
  rationale: "",
  status: "proposed",
  owner_user_id: "",
  node_key: "",
};

export function ProjectActionCenter({
  projectId,
  data,
  execution,
  boards,
  collaborators,
  canEdit,
}: {
  projectId: string;
  data: ProjectActionCenterData;
  execution: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
  canEdit: boolean;
}) {
  const saveRisk = useSaveProjectRisk(projectId);
  const saveDecision = useSaveProjectDecision(projectId);
  const [tab, setTab] = useState<"risks" | "decisions">("risks");
  const [riskDraft, setRiskDraft] = useState<RiskDraft | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft | null>(null);

  const boardMap = useMemo(
    () => new Map(boards.map((board) => [board.id, board] as const)),
    [boards],
  );
  const nodeOptions = useMemo(
    () =>
      execution.items
        .filter(
          (item) =>
            item.node.kind === "task" || item.node.kind === "milestone",
        )
        .slice()
        .sort((a, b) => a.node.title.localeCompare(b.node.title, "ar"))
        .slice(0, 250),
    [execution.items],
  );
  const assignable = useMemo(
    () => collaborators.filter((member) => member.role !== "viewer"),
    [collaborators],
  );

  const sortedRisks = useMemo(
    () =>
      [...data.risks].sort((a, b) => {
        const statusRank = (risk: ProjectRisk) =>
          risk.status === "open"
            ? 0
            : risk.status === "mitigating"
              ? 1
              : risk.status === "accepted"
                ? 2
                : 3;
        const statusDelta = statusRank(a) - statusRank(b);
        if (statusDelta !== 0) return statusDelta;
        const severityDelta =
          RISK_SEVERITY[a.severity].rank - RISK_SEVERITY[b.severity].rank;
        if (severityDelta !== 0) return severityDelta;
        return (a.due_date ?? "9999-12-31").localeCompare(
          b.due_date ?? "9999-12-31",
        );
      }),
    [data.risks],
  );

  const metrics = [
    {
      label: "مخاطر نشطة",
      value: data.summary.active_risks,
      icon: ShieldAlert,
      tone: "text-warning",
    },
    {
      label: "مرتفعة / حرجة",
      value: data.summary.critical_high_risks,
      icon: AlertTriangle,
      tone: "text-danger",
    },
    {
      label: "Mitigation متأخر",
      value: data.summary.overdue_mitigations,
      icon: CalendarClock,
      tone: "text-danger",
    },
    {
      label: "مخاطر مقبولة",
      value: data.summary.accepted_risks,
      icon: CheckCircle2,
      tone: "text-info",
    },
    {
      label: "قرارات معلقة",
      value: data.summary.pending_decisions,
      icon: Gavel,
      tone: "text-warning",
    },
    {
      label: "قرارات آخر 30 يوم",
      value: data.summary.decided_30d,
      icon: Target,
      tone: "text-success",
    },
  ];

  function linkedFromKey(key: string) {
    if (!key) return { board_id: null, node_id: null };
    const [boardId, nodeId] = key.split(":");
    return {
      board_id: boardId || null,
      node_id: nodeId || null,
    };
  }

  function editRisk(risk: ProjectRisk) {
    setTab("risks");
    setDecisionDraft(null);
    setRiskDraft({
      id: risk.id,
      expected_version: risk.version,
      title: risk.title,
      description: risk.description ?? "",
      severity: risk.severity,
      status: risk.status,
      owner_user_id: risk.owner_user_id ?? "",
      mitigation: risk.mitigation ?? "",
      due_date: risk.due_date ?? "",
      node_key:
        risk.board_id && risk.node_id ? `${risk.board_id}:${risk.node_id}` : "",
    });
  }

  function editDecision(decision: ProjectDecision) {
    setTab("decisions");
    setRiskDraft(null);
    setDecisionDraft({
      id: decision.id,
      expected_version: decision.version,
      title: decision.title,
      decision: decision.decision,
      rationale: decision.rationale ?? "",
      status: decision.status,
      owner_user_id: decision.owner_user_id ?? "",
      node_key:
        decision.board_id && decision.node_id
          ? `${decision.board_id}:${decision.node_id}`
          : "",
    });
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Gavel className="h-5 w-5 text-brand" />
              مركز القرارات والمخاطر
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              سجل إداري مرتبط بالتنفيذ: المخاطر، خطة المعالجة، القرارات، المسؤول،
              والارتباط بالمهمة أو المعلم.
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTab("risks");
                  setDecisionDraft(null);
                  setRiskDraft({ ...EMPTY_RISK });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                تسجيل خطر
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("decisions");
                  setRiskDraft(null);
                  setDecisionDraft({ ...EMPTY_DECISION });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[10px] font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                تسجيل قرار
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${tone}`} />
              <p className="text-[9px] text-muted-foreground">{label}</p>
            </div>
            <p className="mt-1 text-xl font-semibold">{arabicNumber(value)}</p>
          </div>
        ))}
      </div>

      {(riskDraft || decisionDraft) && (
        <div className="border-b border-border bg-muted/10 p-4">
          {riskDraft ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {riskDraft.id ? "تعديل الخطر" : "خطر جديد"}
                </h3>
                <button
                  type="button"
                  onClick={() => setRiskDraft(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="xl:col-span-2 text-[10px] text-muted-foreground">
                  عنوان الخطر
                  <input
                    value={riskDraft.title}
                    maxLength={200}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft ? { ...draft, title: event.target.value } : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  مستوى الخطر
                  <select
                    value={riskDraft.severity}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              severity: event.target.value as ProjectRiskSeverity,
                            }
                          : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    <option value="low">منخفض</option>
                    <option value="medium">متوسط</option>
                    <option value="high">مرتفع</option>
                    <option value="critical">حرج</option>
                  </select>
                </label>
                <label className="text-[10px] text-muted-foreground">
                  الحالة
                  <select
                    value={riskDraft.status}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              status: event.target.value as ProjectRiskStatus,
                            }
                          : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    {Object.entries(RISK_STATUS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] text-muted-foreground">
                  مسؤول المعالجة
                  <select
                    value={riskDraft.owner_user_id}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft
                          ? { ...draft, owner_user_id: event.target.value }
                          : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    <option value="">بدون مسؤول</option>
                    {assignable.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] text-muted-foreground">
                  موعد المعالجة
                  <input
                    type="date"
                    value={riskDraft.due_date}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft ? { ...draft, due_date: event.target.value } : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  />
                </label>
                <label className="md:col-span-2 text-[10px] text-muted-foreground">
                  مرتبط بمهمة / معلم
                  <select
                    value={riskDraft.node_key}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft ? { ...draft, node_key: event.target.value } : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    <option value="">بدون ارتباط مباشر</option>
                    {nodeOptions.map((item) => (
                      <option
                        key={item.board_id + ":" + item.node.id}
                        value={item.board_id + ":" + item.node.id}
                      >
                        {boardMap.get(item.board_id)?.name ?? "لوحة"} · {item.node.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="md:col-span-2 text-[10px] text-muted-foreground">
                  وصف الخطر
                  <textarea
                    rows={3}
                    value={riskDraft.description}
                    maxLength={4000}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft
                          ? { ...draft, description: event.target.value }
                          : draft,
                      )
                    }
                    className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5"
                  />
                </label>
                <label className="md:col-span-2 text-[10px] text-muted-foreground">
                  خطة المعالجة / Mitigation
                  <textarea
                    rows={3}
                    value={riskDraft.mitigation}
                    maxLength={4000}
                    onChange={(event) =>
                      setRiskDraft((draft) =>
                        draft
                          ? { ...draft, mitigation: event.target.value }
                          : draft,
                      )
                    }
                    className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={
                  !riskDraft.title.trim() ||
                  saveRisk.isPending ||
                  !canEdit
                }
                onClick={() => {
                  const link = linkedFromKey(riskDraft.node_key);
                  const member = assignable.find(
                    (row) => row.user_id === riskDraft.owner_user_id,
                  );
                  saveRisk.mutate(
                    {
                      id: riskDraft.id,
                      expected_version: riskDraft.expected_version,
                      title: riskDraft.title,
                      description: riskDraft.description || null,
                      severity: riskDraft.severity,
                      status: riskDraft.status,
                      owner_user_id: riskDraft.owner_user_id || null,
                      owner_name: member?.full_name ?? null,
                      mitigation: riskDraft.mitigation || null,
                      due_date: riskDraft.due_date || null,
                      board_id: link.board_id,
                      node_id: link.node_id,
                    },
                    { onSuccess: () => setRiskDraft(null) },
                  );
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                حفظ الخطر
              </button>
            </div>
          ) : decisionDraft ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {decisionDraft.id ? "تعديل القرار" : "قرار جديد"}
                </h3>
                <button
                  type="button"
                  onClick={() => setDecisionDraft(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="xl:col-span-2 text-[10px] text-muted-foreground">
                  عنوان القرار
                  <input
                    value={decisionDraft.title}
                    maxLength={200}
                    onChange={(event) =>
                      setDecisionDraft((draft) =>
                        draft ? { ...draft, title: event.target.value } : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  الحالة
                  <select
                    value={decisionDraft.status}
                    onChange={(event) =>
                      setDecisionDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              status: event.target.value as ProjectDecisionStatus,
                            }
                          : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    {Object.entries(DECISION_STATUS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] text-muted-foreground">
                  مسؤول المتابعة
                  <select
                    value={decisionDraft.owner_user_id}
                    onChange={(event) =>
                      setDecisionDraft((draft) =>
                        draft
                          ? { ...draft, owner_user_id: event.target.value }
                          : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    <option value="">بدون مسؤول</option>
                    {assignable.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="md:col-span-2 text-[10px] text-muted-foreground">
                  مرتبط بمهمة / معلم
                  <select
                    value={decisionDraft.node_key}
                    onChange={(event) =>
                      setDecisionDraft((draft) =>
                        draft ? { ...draft, node_key: event.target.value } : draft,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    <option value="">بدون ارتباط مباشر</option>
                    {nodeOptions.map((item) => (
                      <option
                        key={item.board_id + ":" + item.node.id}
                        value={item.board_id + ":" + item.node.id}
                      >
                        {boardMap.get(item.board_id)?.name ?? "لوحة"} · {item.node.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="md:col-span-2 text-[10px] text-muted-foreground">
                  القرار
                  <textarea
                    rows={4}
                    value={decisionDraft.decision}
                    maxLength={5000}
                    onChange={(event) =>
                      setDecisionDraft((draft) =>
                        draft
                          ? { ...draft, decision: event.target.value }
                          : draft,
                      )
                    }
                    className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5"
                  />
                </label>
                <label className="md:col-span-4 text-[10px] text-muted-foreground">
                  المبررات / Rationale
                  <textarea
                    rows={3}
                    value={decisionDraft.rationale}
                    maxLength={5000}
                    onChange={(event) =>
                      setDecisionDraft((draft) =>
                        draft
                          ? { ...draft, rationale: event.target.value }
                          : draft,
                      )
                    }
                    className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={
                  !decisionDraft.title.trim() ||
                  !decisionDraft.decision.trim() ||
                  saveDecision.isPending ||
                  !canEdit
                }
                onClick={() => {
                  const link = linkedFromKey(decisionDraft.node_key);
                  const member = assignable.find(
                    (row) => row.user_id === decisionDraft.owner_user_id,
                  );
                  saveDecision.mutate(
                    {
                      id: decisionDraft.id,
                      expected_version: decisionDraft.expected_version,
                      title: decisionDraft.title,
                      decision: decisionDraft.decision,
                      rationale: decisionDraft.rationale || null,
                      status: decisionDraft.status,
                      owner_user_id: decisionDraft.owner_user_id || null,
                      owner_name: member?.full_name ?? null,
                      board_id: link.board_id,
                      node_id: link.node_id,
                    },
                    { onSuccess: () => setDecisionDraft(null) },
                  );
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                حفظ القرار
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="border-b border-border p-2">
        <div className="inline-flex rounded-xl border border-border p-1">
          <button
            type="button"
            onClick={() => setTab("risks")}
            className={
              tab === "risks"
                ? "rounded-lg bg-brand px-3 py-1.5 text-[10px] font-semibold text-primary-foreground"
                : "rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
            }
          >
            المخاطر · {arabicNumber(data.risks.length)}
          </button>
          <button
            type="button"
            onClick={() => setTab("decisions")}
            className={
              tab === "decisions"
                ? "rounded-lg bg-brand px-3 py-1.5 text-[10px] font-semibold text-primary-foreground"
                : "rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
            }
          >
            القرارات · {arabicNumber(data.decisions.length)}
          </button>
        </div>
      </div>

      {tab === "risks" ? (
        !sortedRisks.length ? (
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-semibold">لا يوجد Risk Register بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">
              سجّل المخاطر التي تحتاج متابعة إدارية وخطة معالجة واضحة.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedRisks.map((risk) => {
              const meta = RISK_SEVERITY[risk.severity];
              const overdue =
                (risk.status === "open" || risk.status === "mitigating") &&
                !!risk.due_date &&
                risk.due_date < todayKey();
              const boardName =
                risk.board_name ??
                (risk.board_id ? boardMap.get(risk.board_id)?.name : null);
              return (
                <div key={risk.id} className="p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{risk.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] ${meta.className}`}>
                          {meta.label}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
                          {RISK_STATUS[risk.status]}
                        </span>
                        {overdue && (
                          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[9px] text-danger">
                            معالجة متأخرة
                          </span>
                        )}
                      </div>

                      {risk.description && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {risk.description}
                        </p>
                      )}

                      <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg bg-muted/30 p-2">
                          <p className="text-muted-foreground">المسؤول</p>
                          <p className="mt-0.5 font-medium">
                            {risk.owner_name ?? "غير محدد"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2">
                          <p className="text-muted-foreground">موعد المعالجة</p>
                          <p className={overdue ? "mt-0.5 font-medium text-danger" : "mt-0.5 font-medium"}>
                            {formatDate(risk.due_date)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2 sm:col-span-2">
                          <p className="text-muted-foreground">خطة المعالجة</p>
                          <p className="mt-0.5 line-clamp-2 font-medium">
                            {risk.mitigation ?? "لم تُسجل خطة معالجة بعد"}
                          </p>
                        </div>
                      </div>

                      {risk.board_id && risk.node_id && (
                        <Link
                          to="/project/$projectId/board/$boardId"
                          params={{ projectId, boardId: risk.board_id }}
                          search={{ node: risk.node_id }}
                          className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-brand hover:underline"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {boardName ?? "اللوحة"} · {risk.node_title ?? "العنصر المرتبط"}
                        </Link>
                      )}
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => editRisk(risk)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
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
        )
      ) : !data.decisions.length ? (
        <div className="p-8 text-center">
          <Gavel className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold">لا يوجد Decision Log بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            سجّل القرارات المهمة ومبرراتها وربطها بالتنفيذ.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.decisions.map((decision) => {
            const boardName =
              decision.board_name ??
              (decision.board_id
                ? boardMap.get(decision.board_id)?.name
                : null);
            return (
              <div key={decision.id} className="p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{decision.title}</p>
                      <span
                        className={
                          decision.status === "decided"
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-[9px] text-success"
                            : decision.status === "proposed"
                              ? "rounded-full bg-warning/10 px-2 py-0.5 text-[9px] text-warning"
                              : "rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground"
                        }
                      >
                        {DECISION_STATUS[decision.status]}
                      </span>
                    </div>

                    <div className="mt-2 rounded-xl bg-muted/25 p-3">
                      <p className="text-[9px] text-muted-foreground">القرار</p>
                      <p className="mt-1 text-xs leading-5">{decision.decision}</p>
                    </div>

                    {decision.rationale && (
                      <div className="mt-2">
                        <p className="text-[9px] text-muted-foreground">المبررات</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {decision.rationale}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <UserRound className="h-3 w-3" />
                        {decision.owner_name ?? "بدون مسؤول متابعة"}
                      </span>
                      {decision.decided_at && (
                        <span className="rounded-full bg-muted px-2 py-1">
                          اتُّخذ {formatTimestamp(decision.decided_at)}
                        </span>
                      )}
                      {decision.board_id && decision.node_id && (
                        <Link
                          to="/project/$projectId/board/$boardId"
                          params={{ projectId, boardId: decision.board_id }}
                          search={{ node: decision.node_id }}
                          className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-brand hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          {boardName ?? "اللوحة"} · {decision.node_title ?? "العنصر"}
                        </Link>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => editDecision(decision)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
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

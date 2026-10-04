import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Flag,
  Link2,
  Pencil,
  Plus,
  Save,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useSavePortfolioObjective } from "@/hooks/use-strategy";
import { arabicNumber } from "@/lib/format";
import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { PortfolioActionCenterData } from "@/types/portfolio-actions";
import type {
  KeyResultDirection,
  ObjectiveStatus,
  PortfolioObjective,
  PortfolioStrategyData,
} from "@/types/strategy";

interface KrDraft {
  id?: string | null;
  title: string;
  unit: string;
  direction: KeyResultDirection;
  baseline_value: number;
  current_value: number;
  target_value: number;
  weight: number;
}

interface ObjectiveDraft {
  id: string | null;
  expected_version: number | null;
  owner_user_id: string | null;
  title: string;
  description: string;
  status: ObjectiveStatus;
  start_date: string;
  due_date: string;
  key_results: KrDraft[];
  project_ids: string[];
  milestone_keys: string[];
}

const STATUS_LABELS: Record<ObjectiveStatus, string> = {
  draft: "مسودة",
  active: "نشط",
  achieved: "متحقق",
  paused: "متوقف مؤقتًا",
  cancelled: "ملغى",
};

function emptyDraft(): ObjectiveDraft {
  return {
    id: null,
    expected_version: null,
    owner_user_id: null,
    title: "",
    description: "",
    status: "active",
    start_date: "",
    due_date: "",
    key_results: [],
    project_ids: [],
    milestone_keys: [],
  };
}

function keyResultProgress(kr: KrDraft | PortfolioObjective["key_results"][number]) {
  const baseline = kr.baseline_value;
  const target = kr.target_value;
  const current = kr.current_value;
  let progress = 0;

  if (kr.direction === "increase") {
    const distance = target - baseline;
    progress = distance === 0 ? (current >= target ? 100 : 0) : ((current - baseline) / distance) * 100;
  } else {
    const distance = baseline - target;
    progress = distance === 0 ? (current <= target ? 100 : 0) : ((baseline - current) / distance) * 100;
  }

  return Math.max(0, Math.min(100, progress));
}

function objectiveProgress(objective: PortfolioObjective) {
  const rows = objective.key_results;
  if (!rows.length) return null;
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return null;
  return rows.reduce(
    (sum, row) => sum + keyResultProgress(row) * row.weight,
    0,
  ) / totalWeight;
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
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function StrategicAlignmentCenter({
  data,
  projects,
  boards,
  execution,
  portfolioActions,
  isLoading,
}: {
  data: PortfolioStrategyData | undefined;
  projects: Project[];
  boards: BoardWithContext[];
  execution: ProjectExecutionSummary | undefined;
  portfolioActions: PortfolioActionCenterData | undefined;
  isLoading: boolean;
}) {
  const save = useSavePortfolioObjective();
  const [draft, setDraft] = useState<ObjectiveDraft | null>(null);
  const objectives = data?.objectives ?? [];
  const today = useMemo(todayKey, []);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const boardMap = useMemo(
    () => new Map(boards.map((board) => [board.id, board] as const)),
    [boards],
  );
  const milestoneItems = useMemo(
    () =>
      (execution?.items ?? [])
        .filter((item) => item.node.kind === "milestone")
        .map((item) => {
          const board = boardMap.get(item.board_id);
          return {
            key: `${item.board_id}:${item.node.id}`,
            board_id: item.board_id,
            node_id: item.node.id,
            project_id: board?.project_id ?? "",
            project_name: board?.project_name ?? "",
            board_name: board?.name ?? "",
            title: item.node.title,
            status: item.node.status,
            due_date: item.node.due_date,
            is_overdue: item.is_overdue,
          };
        })
        .filter((item) => !!item.project_id),
    [execution?.items, boardMap],
  );

  const linkedMilestoneSet = useMemo(
    () =>
      new Map(
        objectives.flatMap((objective) =>
          objective.milestones.map((milestone) => [
            `${objective.id}:${milestone.node_id}`,
            milestone,
          ] as const),
        ),
      ),
    [objectives],
  );

  const cards = useMemo(
    () =>
      objectives.map((objective) => {
        const projectIds = new Set(objective.project_ids);
        const activeRisks = (portfolioActions?.risks ?? []).filter(
          (risk) =>
            projectIds.has(risk.project_id) &&
            (risk.status === "open" || risk.status === "mitigating"),
        );
        const criticalRisks = activeRisks.filter(
          (risk) => risk.severity === "critical",
        ).length;
        const highRisks = activeRisks.filter(
          (risk) => risk.severity === "high",
        ).length;
        const overdueMitigation = activeRisks.filter(
          (risk) => !!risk.due_date && risk.due_date < today,
        ).length;
        const pendingDecisions = (portfolioActions?.decisions ?? []).filter(
          (decision) =>
            projectIds.has(decision.project_id) &&
            decision.status === "proposed",
        ).length;

        const linkedIds = new Set(objective.milestones.map((row) => row.node_id));
        const liveMilestones = (execution?.items ?? []).filter((item) =>
          linkedIds.has(item.node.id),
        );
        const overdueMilestones = liveMilestones.filter(
          (item) => item.is_overdue,
        ).length;
        const blockedMilestones = liveMilestones.filter(
          (item) => item.node.status === "blocked",
        ).length;

        const impact =
          criticalRisks > 0 || overdueMilestones > 0
            ? "intervention"
            : highRisks > 0 ||
                overdueMitigation > 0 ||
                blockedMilestones > 0 ||
                pendingDecisions > 0
              ? "follow_up"
              : "stable";

        return {
          objective,
          progress: objectiveProgress(objective),
          criticalRisks,
          highRisks,
          overdueMitigation,
          pendingDecisions,
          overdueMilestones,
          blockedMilestones,
          impact,
        };
      }),
    [objectives, portfolioActions, execution?.items, today],
  );

  function editObjective(objective: PortfolioObjective) {
    setDraft({
      id: objective.id,
      expected_version: objective.version,
      owner_user_id: objective.owner_user_id,
      title: objective.title,
      description: objective.description ?? "",
      status: objective.status,
      start_date: objective.start_date ?? "",
      due_date: objective.due_date ?? "",
      key_results: objective.key_results.map((kr) => ({
        id: kr.id,
        title: kr.title,
        unit: kr.unit ?? "",
        direction: kr.direction,
        baseline_value: kr.baseline_value,
        current_value: kr.current_value,
        target_value: kr.target_value,
        weight: kr.weight,
      })),
      project_ids: [...objective.project_ids],
      milestone_keys: objective.milestones.map(
        (milestone) => `${milestone.board_id}:${milestone.node_id}`,
      ),
    });
  }

  function toggleProject(projectId: string) {
    if (!draft) return;
    setDraft((current) => {
      if (!current) return current;
      const selected = current.project_ids.includes(projectId);
      const nextProjects = selected
        ? current.project_ids.filter((id) => id !== projectId)
        : [...current.project_ids, projectId];
      const nextMilestones = current.milestone_keys.filter((key) => {
        const item = milestoneItems.find((row) => row.key === key);
        return !item || nextProjects.includes(item.project_id);
      });
      return {
        ...current,
        project_ids: nextProjects,
        milestone_keys: nextMilestones,
      };
    });
  }

  function toggleMilestone(key: string) {
    if (!draft) return;
    const item = milestoneItems.find((row) => row.key === key);
    if (!item) return;
    setDraft((current) => {
      if (!current) return current;
      const selected = current.milestone_keys.includes(key);
      return {
        ...current,
        project_ids: current.project_ids.includes(item.project_id)
          ? current.project_ids
          : [...current.project_ids, item.project_id],
        milestone_keys: selected
          ? current.milestone_keys.filter((value) => value !== key)
          : [...current.milestone_keys, key],
      };
    });
  }

  function addKr() {
    setDraft((current) =>
      current
        ? {
            ...current,
            key_results: [
              ...current.key_results,
              {
                id: null,
                title: "",
                unit: "",
                direction: "increase",
                baseline_value: 0,
                current_value: 0,
                target_value: 100,
                weight: 1,
              },
            ],
          }
        : current,
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل الأهداف الاستراتيجية…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-5 w-5 text-brand" />
            الأهداف الاستراتيجية وOKRs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            اربط أهداف المحفظة بالمشاريع والـMilestones، وافصل قياس النتيجة عن
            إشارات مخاطر التنفيذ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          هدف استراتيجي
        </button>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        تقدم Objective = المتوسط الموزون لنسب Key Results فقط. التأخير والمخاطر
        والقرارات المعلقة تظهر كـStrategic Impact منفصل ولا تغيّر نسبة الـOKR
        تلقائيًا.
      </div>

      {draft && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {draft.id ? "تعديل الهدف الاستراتيجي" : "هدف استراتيجي جديد"}
            </h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              عنوان Objective
              <input
                value={draft.title}
                maxLength={200}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              الحالة
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          status: event.target.value as ObjectiveStatus,
                        }
                      : current,
                  )
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
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-muted-foreground">
                البداية
                <input
                  type="date"
                  value={draft.start_date}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, start_date: event.target.value }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
                />
              </label>
              <label className="text-[10px] text-muted-foreground">
                النهاية
                <input
                  type="date"
                  value={draft.due_date}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, due_date: event.target.value }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
                />
              </label>
            </div>
            <label className="md:col-span-2 xl:col-span-4 text-[10px] text-muted-foreground">
              الوصف
              <textarea
                rows={2}
                maxLength={5000}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold">Key Results</h4>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Weight يحدد مساهمة كل KR بعد تطبيع مجموع الأوزان.
                </p>
              </div>
              <button
                type="button"
                onClick={addKr}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                Key Result
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {draft.key_results.map((kr, index) => (
                <div
                  key={kr.id ?? index}
                  className="grid gap-2 rounded-xl border border-border bg-background p-3 md:grid-cols-2 xl:grid-cols-[1.6fr_.7fr_.7fr_.7fr_.7fr_.55fr_auto]"
                >
                  <input
                    value={kr.title}
                    placeholder="عنوان النتيجة"
                    onChange={(event) =>
                      setDraft((current) => {
                        if (!current) return current;
                        const rows = [...current.key_results];
                        rows[index] = { ...rows[index]!, title: event.target.value };
                        return { ...current, key_results: rows };
                      })
                    }
                    className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                  />
                  <select
                    value={kr.direction}
                    onChange={(event) =>
                      setDraft((current) => {
                        if (!current) return current;
                        const rows = [...current.key_results];
                        rows[index] = {
                          ...rows[index]!,
                          direction: event.target.value as KeyResultDirection,
                        };
                        return { ...current, key_results: rows };
                      })
                    }
                    className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
                  >
                    <option value="increase">زيادة</option>
                    <option value="decrease">خفض</option>
                  </select>
                  {(["baseline_value", "current_value", "target_value", "weight"] as const).map(
                    (field) => (
                      <input
                        key={field}
                        type="number"
                        step="any"
                        value={kr[field]}
                        title={
                          field === "baseline_value"
                            ? "Baseline"
                            : field === "current_value"
                              ? "Current"
                              : field === "target_value"
                                ? "Target"
                                : "Weight"
                        }
                        onChange={(event) =>
                          setDraft((current) => {
                            if (!current) return current;
                            const rows = [...current.key_results];
                            rows[index] = {
                              ...rows[index]!,
                              [field]: Number(event.target.value),
                            };
                            return { ...current, key_results: rows };
                          })
                        }
                        className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
                      />
                    ),
                  )}
                  <input
                    value={kr.unit}
                    placeholder="الوحدة"
                    onChange={(event) =>
                      setDraft((current) => {
                        if (!current) return current;
                        const rows = [...current.key_results];
                        rows[index] = { ...rows[index]!, unit: event.target.value };
                        return { ...current, key_results: rows };
                      })
                    }
                    className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              key_results: current.key_results.filter(
                                (_, rowIndex) => rowIndex !== index,
                              ),
                            }
                          : current,
                      )
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="md:col-span-2 xl:col-span-7 text-[9px] text-muted-foreground">
                    Baseline {kr.baseline_value} → Current {kr.current_value} → Target{" "}
                    {kr.target_value} · التقدم {Math.round(keyResultProgress(kr))}%
                  </div>
                </div>
              ))}
              {!draft.key_results.length && (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                  يمكن حفظ Objective بدون KRs كمسودة، ولن يعرض النظام نسبة تقدم
                  حتى تضيف نتائج قابلة للقياس.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold">المشاريع المرتبطة</h4>
              <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-2">
                {projects.map((project) => (
                  <label
                    key={project.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={draft.project_ids.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                    />
                    <span className="truncate">{project.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold">Milestones المرتبطة</h4>
              <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border p-2">
                {milestoneItems
                  .filter(
                    (item) =>
                      !draft.project_ids.length ||
                      draft.project_ids.includes(item.project_id),
                  )
                  .slice(0, 120)
                  .map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-2 rounded-lg px-2 py-2 text-[10px] hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={draft.milestone_keys.includes(item.key)}
                        onChange={() => toggleMilestone(item.key)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="block truncate text-[9px] text-muted-foreground">
                          {item.project_name} · {item.board_name}
                        </span>
                      </span>
                    </label>
                  ))}
                {!milestoneItems.length && (
                  <p className="p-3 text-center text-[10px] text-muted-foreground">
                    لا توجد Milestones حالية للربط.
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={!draft.title.trim() || save.isPending}
            onClick={() => {
              const milestones = draft.milestone_keys
                .map((key) => milestoneItems.find((item) => item.key === key))
                .filter((item): item is NonNullable<typeof item> => !!item)
                .map((item) => ({
                  project_id: item.project_id,
                  board_id: item.board_id,
                  node_id: item.node_id,
                }));
              save.mutate(
                {
                  id: draft.id,
                  expected_version: draft.expected_version,
                  title: draft.title,
                  description: draft.description || null,
                  status: draft.status,
                  owner_user_id: draft.owner_user_id,
                  start_date: draft.start_date || null,
                  due_date: draft.due_date || null,
                  key_results: draft.key_results.map((kr) => ({
                    ...kr,
                    unit: kr.unit || null,
                  })),
                  project_ids: draft.project_ids,
                  milestones,
                },
                { onSuccess: () => setDraft(null) },
              );
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ Objective
          </button>
        </div>
      )}

      {!cards.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Target className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">لا توجد أهداف استراتيجية بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            أنشئ أول Objective ثم اربطه بالمشاريع والنتائج القابلة للقياس.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {cards.map((card) => {
            const { objective } = card;
            const impactMeta =
              card.impact === "intervention"
                ? {
                    label: "تأثير يحتاج تدخل",
                    className: "bg-danger/10 text-danger",
                    icon: AlertTriangle,
                  }
                : card.impact === "follow_up"
                  ? {
                      label: "تأثير يحتاج متابعة",
                      className: "bg-warning/10 text-warning",
                      icon: Flag,
                    }
                  : {
                      label: "لا توجد إشارة تأثير حرجة",
                      className: "bg-success/10 text-success",
                      icon: CheckCircle2,
                    };
            const ImpactIcon = impactMeta.icon;

            return (
              <article
                key={objective.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{objective.title}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
                        {STATUS_LABELS[objective.status]}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] ${impactMeta.className}`}
                      >
                        <ImpactIcon className="h-3 w-3" />
                        {impactMeta.label}
                      </span>
                    </div>
                    {objective.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {objective.description}
                      </p>
                    )}
                  </div>
                  {objective.can_edit && (
                    <button
                      type="button"
                      onClick={() => editObjective(objective)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr]">
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-[9px] text-muted-foreground">OKR Progress</p>
                    <p className="mt-1 text-2xl font-bold">
                      {card.progress == null ? "—" : `${Math.round(card.progress)}%`}
                    </p>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      {objective.key_results.length
                        ? `${arabicNumber(objective.key_results.length)} Key Results`
                        : "لا توجد KRs"}
                    </p>
                  </div>
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${card.progress ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] sm:grid-cols-4">
                      <div className="rounded-lg bg-danger/5 p-2 text-center">
                        <strong className="text-danger">{card.criticalRisks}</strong>
                        <p className="text-muted-foreground">Critical Risk</p>
                      </div>
                      <div className="rounded-lg bg-warning/5 p-2 text-center">
                        <strong className="text-warning">{card.highRisks}</strong>
                        <p className="text-muted-foreground">High Risk</p>
                      </div>
                      <div className="rounded-lg bg-danger/5 p-2 text-center">
                        <strong className="text-danger">{card.overdueMilestones}</strong>
                        <p className="text-muted-foreground">Milestone متأخر</p>
                      </div>
                      <div className="rounded-lg bg-info/5 p-2 text-center">
                        <strong className="text-info">{card.pendingDecisions}</strong>
                        <p className="text-muted-foreground">قرار معلق</p>
                      </div>
                    </div>
                  </div>
                </div>

                {!!objective.key_results.length && (
                  <div className="mt-4 space-y-2">
                    {objective.key_results.slice(0, 5).map((kr) => (
                      <div key={kr.id} className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-3.5 w-3.5 text-brand" />
                          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold">
                            {kr.title}
                          </p>
                          <span className="text-[9px] text-muted-foreground">
                            {Math.round(keyResultProgress(kr))}% · وزن {kr.weight}
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] text-muted-foreground">
                          {kr.baseline_value} → {kr.current_value} → {kr.target_value}{" "}
                          {kr.unit ?? ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-[9px]">
                  {objective.project_ids.map((projectId) => (
                    <Link
                      key={projectId}
                      to="/project/$projectId"
                      params={{ projectId }}
                      className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-brand hover:underline"
                    >
                      <Link2 className="h-3 w-3" />
                      {projectMap.get(projectId)?.name ?? "مشروع"}
                    </Link>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground">
                  <span>
                    المدة: {formatDate(objective.start_date)} → {formatDate(objective.due_date)}
                  </span>
                  <span>
                    {arabicNumber(objective.milestones.length)} Milestones مرتبطة
                  </span>
                  {card.overdueMitigation > 0 && (
                    <span className="text-danger">
                      {arabicNumber(card.overdueMitigation)} Mitigation متأخر
                    </span>
                  )}
                  {card.blockedMilestones > 0 && (
                    <span className="text-warning">
                      {arabicNumber(card.blockedMilestones)} Milestone معطل
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

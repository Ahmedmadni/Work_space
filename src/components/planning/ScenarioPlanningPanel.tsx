import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  Gauge,
  RotateCcw,
  Save,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useApplyProjectPlanningScenario } from "@/hooks/use-planning";
import type { ProjectExecutionItem, ProjectExecutionSummary } from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type {
  PlanningScenarioChange,
  ProjectPlanningData,
} from "@/types/planning";

interface ScenarioDraft {
  board_id: string;
  node_id: string;
  expected_version: number;
  title: string;
  start_date: string | null;
  due_date: string | null;
  effort_hours: number | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 12));
}

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getUTCDay());
}

function localTodayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function workingDayKeys(start: string, due: string) {
  const a = dateFromKey(start);
  const b = dateFromKey(due);
  const days: string[] = [];
  for (
    let cursor = new Date(a);
    cursor <= b;
    cursor = addDays(cursor, 1)
  ) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 5 && weekday !== 6) days.push(dateKey(cursor));
  }
  return days.length ? days : [start];
}

function sameDraftAsItem(draft: ScenarioDraft, item: ProjectExecutionItem) {
  return (
    draft.start_date === item.node.start_date &&
    draft.due_date === item.node.due_date &&
    draft.effort_hours === item.node.effort_hours &&
    draft.assignee_user_id === item.node.assignee_user_id
  );
}

function allocationMetrics(
  items: ProjectExecutionItem[],
  capacity: Map<string, number>,
) {
  const currentWeek = startOfWeek(dateFromKey(localTodayKey()));
  const weeks = new Set(
    Array.from({ length: 8 }, (_, index) =>
      dateKey(addDays(currentWeek, index * 7)),
    ),
  );
  const allocation = new Map<string, Map<string, number>>();

  for (const item of items) {
    if (
      item.node.status === "done" ||
      !item.node.assignee_user_id ||
      !item.node.start_date ||
      !item.node.due_date ||
      !item.node.effort_hours ||
      item.node.effort_hours <= 0
    ) {
      continue;
    }

    const days = workingDayKeys(item.node.start_date, item.node.due_date);
    const perDay = item.node.effort_hours / days.length;
    const userWeeks =
      allocation.get(item.node.assignee_user_id) ?? new Map<string, number>();

    for (const day of days) {
      const week = dateKey(startOfWeek(dateFromKey(day)));
      if (!weeks.has(week)) continue;
      userWeeks.set(week, (userWeeks.get(week) ?? 0) + perDay);
    }
    allocation.set(item.node.assignee_user_id, userWeeks);
  }

  let overloadedWeeks = 0;
  let nearWeeks = 0;
  let peakRatio = 0;

  for (const [userId, userWeeks] of allocation) {
    const userCapacity = capacity.get(userId) ?? 40;
    for (const hours of userWeeks.values()) {
      const ratio =
        userCapacity > 0
          ? hours / userCapacity
          : hours > 0
            ? Number.POSITIVE_INFINITY
            : 0;
      if (ratio > 1) overloadedWeeks += 1;
      else if (ratio >= 0.85) nearWeeks += 1;
      peakRatio = Math.max(peakRatio, ratio);
    }
  }

  return { overloadedWeeks, nearWeeks, peakRatio };
}

function dependencyConflictCount(
  items: ProjectExecutionItem[],
  planning: ProjectPlanningData,
) {
  const nodeMap = new Map(items.map((item) => [item.node.id, item.node] as const));
  let conflicts = 0;

  for (const dependency of planning.dependencies) {
    const source = nodeMap.get(dependency.source_node_id);
    const target = nodeMap.get(dependency.target_node_id);
    const sourceStart = source?.start_date ?? source?.due_date;
    const targetDue = target?.due_date ?? target?.start_date;
    if (sourceStart && targetDue && sourceStart <= targetDue) conflicts += 1;
  }

  return conflicts;
}

function formatRatio(value: number) {
  if (!Number.isFinite(value)) return "بدون سعة";
  return `${Math.round(value * 100)}%`;
}

export function ScenarioPlanningPanel({
  projectId,
  summary,
  collaborators,
  planning,
  canEdit,
}: {
  projectId: string;
  summary: ProjectExecutionSummary;
  collaborators: ProjectCollaborator[];
  planning: ProjectPlanningData;
  canEdit: boolean;
}) {
  const applyScenario = useApplyProjectPlanningScenario(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ScenarioDraft>>({});

  const items = useMemo(
    () =>
      summary.items.filter(
        (item) =>
          item.node.kind === "task" || item.node.kind === "milestone",
      ),
    [summary.items],
  );
  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.node.id, item] as const)),
    [items],
  );
  const assignable = useMemo(
    () => collaborators.filter((member) => member.role !== "viewer"),
    [collaborators],
  );
  const capacity = useMemo(
    () =>
      new Map(
        assignable.map((member) => [
          member.user_id,
          planning.capacity.find((row) => row.user_id === member.user_id)
            ?.weekly_capacity_hours ?? 40,
        ] as const),
      ),
    [assignable, planning.capacity],
  );

  const selectedItem =
    (selectedId ? itemMap.get(selectedId) : null) ?? items[0] ?? null;
  const selectedDraft = selectedItem
    ? drafts[selectedItem.node.id] ?? {
        board_id: selectedItem.board_id,
        node_id: selectedItem.node.id,
        expected_version: selectedItem.node.version ?? 1,
        title: selectedItem.node.title,
        start_date: selectedItem.node.start_date,
        due_date: selectedItem.node.due_date,
        effort_hours: selectedItem.node.effort_hours,
        assignee_user_id: selectedItem.node.assignee_user_id,
        assignee_name:
          selectedItem.node.assignee_name ?? selectedItem.node.owner ?? null,
      }
    : null;

  const changedDrafts = useMemo(
    () =>
      Object.values(drafts).filter((draft) => {
        const item = itemMap.get(draft.node_id);
        return !!item && !sameDraftAsItem(draft, item);
      }),
    [drafts, itemMap],
  );

  const simulatedItems = useMemo(
    () =>
      items.map((item) => {
        const draft = drafts[item.node.id];
        if (!draft) return item;
        return {
          ...item,
          node: {
            ...item.node,
            start_date: draft.start_date,
            due_date: draft.due_date,
            effort_hours: draft.effort_hours,
            assignee_user_id: draft.assignee_user_id,
            assignee_name: draft.assignee_name,
            owner: draft.assignee_name,
          },
        };
      }),
    [items, drafts],
  );

  const currentAllocation = useMemo(
    () => allocationMetrics(items, capacity),
    [items, capacity],
  );
  const scenarioAllocation = useMemo(
    () => allocationMetrics(simulatedItems, capacity),
    [simulatedItems, capacity],
  );
  const currentDependencies = useMemo(
    () => dependencyConflictCount(items, planning),
    [items, planning],
  );
  const scenarioDependencies = useMemo(
    () => dependencyConflictCount(simulatedItems, planning),
    [simulatedItems, planning],
  );
  const today = localTodayKey();
  const currentOverdue = items.filter(
    (item) =>
      item.node.status !== "done" &&
      !!item.node.due_date &&
      item.node.due_date < today,
  ).length;
  const scenarioOverdue = simulatedItems.filter(
    (item) =>
      item.node.status !== "done" &&
      !!item.node.due_date &&
      item.node.due_date < today,
  ).length;
  const reassigned = changedDrafts.filter((draft) => {
    const current = itemMap.get(draft.node_id);
    return current?.node.assignee_user_id !== draft.assignee_user_id;
  }).length;

  function updateSelected(patch: Partial<ScenarioDraft>) {
    if (!selectedItem || !selectedDraft) return;
    const next = { ...selectedDraft, ...patch };
    setDrafts((current) => {
      const copy = { ...current };
      if (sameDraftAsItem(next, selectedItem)) delete copy[selectedItem.node.id];
      else copy[selectedItem.node.id] = next;
      return copy;
    });
  }

  const invalidDraft = changedDrafts.some(
    (draft) =>
      (!!draft.start_date &&
        !!draft.due_date &&
        draft.start_date > draft.due_date) ||
      (draft.effort_hours !== null &&
        (draft.effort_hours < 0 || draft.effort_hours > 10000)),
  );

  const changes: PlanningScenarioChange[] = changedDrafts.map((draft) => ({
    board_id: draft.board_id,
    node_id: draft.node_id,
    expected_version: draft.expected_version,
    start_date: draft.start_date,
    due_date: draft.due_date,
    effort_hours: draft.effort_hours,
    assignee_user_id: draft.assignee_user_id,
    assignee_name: draft.assignee_name,
  }));

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="border-b border-border p-3">
          <p className="text-xs font-semibold">اختر مهمة للمحاكاة</p>
          <p className="mt-1 text-[9px] text-muted-foreground">
            لا يتم تغيير البيانات الفعلية حتى اعتماد السيناريو.
          </p>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {items.map((item) => {
            const changed = !!drafts[item.node.id];
            return (
              <button
                key={item.node.id}
                type="button"
                onClick={() => setSelectedId(item.node.id)}
                className={
                  selectedItem?.node.id === item.node.id
                    ? "block w-full border-b border-border bg-brand/5 px-3 py-2.5 text-start"
                    : "block w-full border-b border-border px-3 py-2.5 text-start hover:bg-muted/30"
                }
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {item.node.title}
                  </span>
                  {changed && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
                  )}
                </div>
                <p className="mt-1 truncate text-[9px] text-muted-foreground">
                  {item.node.assignee_name ?? item.node.owner ?? "بدون مسؤول"}
                  {item.node.effort_hours != null
                    ? ` · ${item.node.effort_hours}h`
                    : " · بدون جهد"}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            {
              label: "أسابيع فوق السعة",
              before: currentAllocation.overloadedWeeks,
              after: scenarioAllocation.overloadedWeeks,
              icon: Gauge,
            },
            {
              label: "عناصر متأخرة",
              before: currentOverdue,
              after: scenarioOverdue,
              icon: CalendarClock,
            },
            {
              label: "تعارضات Dependencies",
              before: currentDependencies,
              after: scenarioDependencies,
              icon: AlertTriangle,
            },
            {
              label: "إعادة إسناد",
              before: 0,
              after: reassigned,
              icon: ArrowLeftRight,
            },
          ].map(({ label, before, after, icon: Icon }) => {
            const improved = after < before;
            const worse = after > before && label !== "إعادة إسناد";
            return (
              <div key={label} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{before}</span>
                  <span>→</span>
                  <strong
                    className={
                      improved
                        ? "text-success"
                        : worse
                          ? "text-danger"
                          : "text-foreground"
                    }
                  >
                    {after}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          {selectedItem && selectedDraft ? (
            <>
              <div className="mb-4">
                <h3 className="text-sm font-semibold">{selectedItem.node.title}</h3>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Peak capacity الحالي {formatRatio(currentAllocation.peakRatio)} ·
                  السيناريو {formatRatio(scenarioAllocation.peakRatio)}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-[10px] text-muted-foreground">
                  البداية
                  <input
                    type="date"
                    value={selectedDraft.start_date ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateSelected({ start_date: event.target.value || null })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  الاستحقاق
                  <input
                    type="date"
                    value={selectedDraft.due_date ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateSelected({ due_date: event.target.value || null })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  الجهد / ساعة
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    step={0.25}
                    value={selectedDraft.effort_hours ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateSelected({
                        effort_hours:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  المسؤول
                  <select
                    value={selectedDraft.assignee_user_id ?? ""}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const userId = event.target.value || null;
                      const member = assignable.find(
                        (row) => row.user_id === userId,
                      );
                      updateSelected({
                        assignee_user_id: userId,
                        assignee_name: member?.full_name ?? null,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                  >
                    <option value="">بدون مسؤول</option>
                    {assignable.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              لا توجد مهام قابلة للمحاكاة.
            </div>
          )}
        </div>

        {changedDrafts.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold">مراجعة التغييرات</h3>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {changedDrafts.length} عناصر ستتغير عند الاعتماد.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrafts({})}
                disabled={applyScenario.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                إلغاء السيناريو
              </button>
            </div>

            <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {changedDrafts.map((draft) => {
                const current = itemMap.get(draft.node_id)!;
                return (
                  <div key={draft.node_id} className="px-3 py-2 text-[10px]">
                    <p className="font-semibold">{draft.title}</p>
                    <p className="mt-1 text-muted-foreground">
                      {current.node.start_date ?? "—"} → {draft.start_date ?? "—"} ·{" "}
                      {current.node.due_date ?? "—"} → {draft.due_date ?? "—"} ·{" "}
                      {current.node.effort_hours ?? "—"}h →{" "}
                      {draft.effort_hours ?? "—"}h ·{" "}
                      {current.node.assignee_name ?? current.node.owner ?? "بدون مسؤول"} →{" "}
                      {draft.assignee_name ?? "بدون مسؤول"}
                    </p>
                  </div>
                );
              })}
            </div>

            {invalidDraft && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-danger/10 p-2 text-[10px] text-danger">
                <AlertTriangle className="h-4 w-4" />
                يوجد تاريخ أو جهد غير صالح داخل السيناريو.
              </div>
            )}

            <button
              type="button"
              disabled={
                !canEdit ||
                !changes.length ||
                invalidDraft ||
                applyScenario.isPending
              }
              onClick={() =>
                applyScenario.mutate(changes, {
                  onSuccess: () => setDrafts({}),
                })
              }
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {applyScenario.isPending ? (
                <Gauge className="h-4 w-4 animate-pulse" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              اعتماد السيناريو
            </button>

            <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              في Supabase يتم اعتماد كل التغييرات في Transaction واحدة أو لا يُطبق شيء.
            </div>
          </div>
        )}

        {changedDrafts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            غيّر التاريخ أو الجهد أو المسؤول لأي مهمة لبدء سيناريو What-if.
          </div>
        )}
      </div>
    </div>
  );
}

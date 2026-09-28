import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock3,
  Flag,
  GitBranch,
  Milestone,
  Save,
  UsersRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useCreateProjectScheduleBaseline,
  useProjectPlanningData,
  useSetProjectMemberCapacity,
  useUpdateCanvasNodeSchedule,
} from "@/hooks/use-planning";
import type {
  BoardWithContext,
  ProjectExecutionItem,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type {
  ProjectPlanningData,
  ProjectScheduleBaselineItem,
} from "@/types/planning";

type PlanningTab = "gantt" | "capacity" | "baseline";
type Zoom = "week" | "month" | "quarter";

const DAY_WIDTH: Record<Zoom, number> = {
  week: 28,
  month: 14,
  quarter: 7,
};

function dateFromKey(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}
function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
function localTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12),
  );
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function startOfWeek(date: Date) {
  return addDays(date, -date.getUTCDay());
}
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(dateFromKey(value));
}
function formatWeek(date: Date) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(date);
}
function scheduledRange(item: ProjectExecutionItem) {
  const start = item.node.start_date ?? item.node.due_date;
  const due = item.node.due_date ?? item.node.start_date;
  return start && due ? { start, due } : null;
}
function workingDayKeys(start: string, due: string) {
  const a = dateFromKey(start);
  const b = dateFromKey(due);
  const days: string[] = [];
  const length = Math.max(0, diffDays(a, b));
  for (let i = 0; i <= length; i += 1) {
    const current = addDays(a, i);
    const weekday = current.getUTCDay();
    if (weekday !== 5 && weekday !== 6) days.push(dateKey(current));
  }
  return days.length ? days : [start];
}

function TimelineHeader({
  start,
  end,
  dayWidth,
}: {
  start: Date;
  end: Date;
  dayWidth: number;
}) {
  const totalDays = diffDays(start, end) + 1;
  const weeks: Date[] = [];
  for (let cursor = startOfWeek(start); cursor <= end; cursor = addDays(cursor, 7)) {
    weeks.push(cursor);
  }

  return (
    <div
      className="relative h-10 border-b border-border bg-muted/20"
      style={{ width: totalDays * dayWidth }}
    >
      {weeks.map((week) => {
        const left = diffDays(start, week) * dayWidth;
        return (
          <div
            key={dateKey(week)}
            className="absolute top-0 h-full border-s border-border/70 px-1 pt-2 text-[9px] text-muted-foreground"
            style={{ left, width: 7 * dayWidth }}
          >
            {formatWeek(week)}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleEditor({
  projectId,
  item,
  effort,
  canEdit,
}: {
  projectId: string;
  item: ProjectExecutionItem;
  effort: number | null;
  canEdit: boolean;
}) {
  const update = useUpdateCanvasNodeSchedule(
    projectId,
    item.board_id,
    item.node.id,
  );
  const [start, setStart] = useState(item.node.start_date ?? "");
  const [due, setDue] = useState(item.node.due_date ?? "");
  const [hours, setHours] = useState(effort == null ? "" : String(effort));

  useEffect(() => {
    setStart(item.node.start_date ?? "");
    setDue(item.node.due_date ?? "");
    setHours(effort == null ? "" : String(effort));
  }, [item.node.start_date, item.node.due_date, effort]);

  const invalid = !!start && !!due && start > due;
  const parsedHours = hours === "" ? null : Number(hours);
  const effortInvalid =
    parsedHours !== null &&
    (!Number.isFinite(parsedHours) || parsedHours < 0.25 || parsedHours > 10000);

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[1fr_1fr_140px_auto] md:items-end">
      <label className="text-[10px] text-muted-foreground">
        البداية
        <input
          type="date"
          value={start}
          disabled={!canEdit || update.isPending}
          onChange={(event) => setStart(event.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
        />
      </label>
      <label className="text-[10px] text-muted-foreground">
        الاستحقاق
        <input
          type="date"
          value={due}
          disabled={!canEdit || update.isPending}
          onChange={(event) => setDue(event.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
        />
      </label>
      <label className="text-[10px] text-muted-foreground">
        الجهد المقدّر / ساعة
        <input
          type="number"
          min={0.25}
          max={10000}
          step={0.25}
          value={hours}
          disabled={!canEdit || update.isPending}
          onChange={(event) => setHours(event.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
        />
      </label>
      <button
        type="button"
        disabled={!canEdit || invalid || effortInvalid || update.isPending}
        onClick={() =>
          update.mutate({
            expectedVersion: item.node.version ?? 1,
            startDate: start || null,
            dueDate: due || null,
            effortHours: parsedHours,
          })
        }
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" />
        حفظ
      </button>
      {(invalid || effortInvalid) && (
        <p className="text-[9px] text-danger md:col-span-4">
          {invalid
            ? "تاريخ البداية يجب ألا يكون بعد تاريخ الاستحقاق."
            : "الجهد يجب أن يكون بين 0.25 و 10000 ساعة."}
        </p>
      )}
    </div>
  );
}

function GanttView({
  projectId,
  summary,
  boards,
  planning,
  canEdit,
}: {
  projectId: string;
  summary: ProjectExecutionSummary;
  boards: BoardWithContext[];
  planning: ProjectPlanningData;
  canEdit: boolean;
}) {
  const [zoom, setZoom] = useState<Zoom>("month");
  const [selected, setSelected] = useState<string | null>(null);
  const dayWidth = DAY_WIDTH[zoom];
  const effortMap = useMemo(
    () => new Map(planning.effort.map((row) => [row.node_id, row.effort_hours])),
    [planning.effort],
  );
  const baselineMap = useMemo(
    () =>
      new Map(
        (planning.latest_baseline?.items ?? []).map((row) => [
          row.node_id,
          row,
        ]),
      ),
    [planning.latest_baseline],
  );
  const dependencyBySource = useMemo(() => {
    const map = new Map<string, typeof planning.dependencies>();
    for (const dependency of planning.dependencies) {
      const rows = map.get(dependency.source_node_id) ?? [];
      rows.push(dependency);
      map.set(dependency.source_node_id, rows);
    }
    return map;
  }, [planning.dependencies]);
  const boardMap = useMemo(
    () => new Map(boards.map((board) => [board.id, board] as const)),
    [boards],
  );

  const items = summary.items.filter(
    (item) => item.node.kind === "task" || item.node.kind === "milestone",
  );
  const scheduled = items.filter((item) => scheduledRange(item));
  const unscheduled = items.filter((item) => !scheduledRange(item));

  const dates: Date[] = [localTodayUtc()];
  for (const item of scheduled) {
    const range = scheduledRange(item)!;
    dates.push(dateFromKey(range.start), dateFromKey(range.due));
  }
  for (const baseline of baselineMap.values()) {
    if (baseline.start_date) dates.push(dateFromKey(baseline.start_date));
    if (baseline.due_date) dates.push(dateFromKey(baseline.due_date));
  }
  const min = new Date(Math.min(...dates.map((date) => date.getTime())));
  const max = new Date(Math.max(...dates.map((date) => date.getTime())));
  const rangeStart = addDays(min, -7);
  const rangeEnd = addDays(max, 21);
  const totalDays = diffDays(rangeStart, rangeEnd) + 1;
  const timelineWidth = totalDays * dayWidth;
  const todayLeft = diffDays(rangeStart, localTodayUtc()) * dayWidth;

  const conflictCount = items.filter((item) => {
    const range = scheduledRange(item);
    if (!range) return false;
    return (dependencyBySource.get(item.node.id) ?? []).some(
      (dependency) =>
        dependency.target_due_date &&
        range.start < dependency.target_due_date,
    );
  }).length;

  const selectedItem = items.find(
    (item) => item.node.id === selected,
  ) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-full bg-muted px-2 py-1">
            {scheduled.length} مجدولة
          </span>
          <span className="rounded-full bg-warning/10 px-2 py-1 text-warning">
            {unscheduled.length} بدون جدول
          </span>
          <span className={conflictCount ? "rounded-full bg-danger/10 px-2 py-1 text-danger" : "rounded-full bg-success/10 px-2 py-1 text-success"}>
            {conflictCount} تعارض اعتماد
          </span>
          {planning.latest_baseline && (
            <span className="rounded-full bg-info/10 px-2 py-1 text-info">
              Baseline: {planning.latest_baseline.name}
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-border p-1">
          {(["week", "month", "quarter"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setZoom(value)}
              className={
                zoom === value
                  ? "rounded-md bg-brand px-2.5 py-1 text-[10px] font-semibold text-primary-foreground"
                  : "rounded-md px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              }
            >
              {value === "week" ? "أسبوع" : value === "month" ? "شهر" : "ربع"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[300px_minmax(600px,1fr)]">
            <div className="h-10 border-b border-e border-border bg-muted/20 px-3 pt-2 text-[10px] font-medium text-muted-foreground">
              المهمة / اللوحة
            </div>
            <div className="overflow-hidden">
              <TimelineHeader
                start={rangeStart}
                end={rangeEnd}
                dayWidth={dayWidth}
              />
            </div>

            {scheduled.map((item) => {
              const range = scheduledRange(item)!;
              const start = dateFromKey(range.start);
              const due = dateFromKey(range.due);
              const left = diffDays(rangeStart, start) * dayWidth;
              const width = Math.max(
                dayWidth,
                (diffDays(start, due) + 1) * dayWidth,
              );
              const baseline = baselineMap.get(item.node.id);
              const baselineStart = baseline?.start_date ?? baseline?.due_date;
              const baselineDue = baseline?.due_date ?? baseline?.start_date;
              const baselineLeft = baselineStart
                ? diffDays(rangeStart, dateFromKey(baselineStart)) * dayWidth
                : 0;
              const baselineWidth =
                baselineStart && baselineDue
                  ? Math.max(
                      dayWidth,
                      (diffDays(
                        dateFromKey(baselineStart),
                        dateFromKey(baselineDue),
                      ) + 1) * dayWidth,
                    )
                  : 0;
              const dependencies = dependencyBySource.get(item.node.id) ?? [];
              const conflict = dependencies.some(
                (dependency) =>
                  dependency.target_due_date &&
                  range.start < dependency.target_due_date,
              );
              const slip =
                baselineDue && range.due > baselineDue
                  ? diffDays(dateFromKey(baselineDue), due)
                  : 0;
              const board = boardMap.get(item.board_id);

              return (
                <div key={item.board_id + ":" + item.node.id} className="contents">
                  <button
                    type="button"
                    onClick={() => setSelected(item.node.id)}
                    className={
                      selected === item.node.id
                        ? "min-h-14 border-b border-e border-brand/30 bg-brand/5 px-3 py-2 text-start"
                        : "min-h-14 border-b border-e border-border px-3 py-2 text-start hover:bg-muted/30"
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      {item.node.kind === "milestone" ? (
                        <Milestone className="h-3.5 w-3.5 text-brand" />
                      ) : (
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="truncate text-xs font-semibold">
                        {item.node.title}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[9px] text-muted-foreground">
                      {board?.name ?? item.board_id}
                      {item.node.assignee_name
                        ? ` · ${item.node.assignee_name}`
                        : ""}
                      {slip > 0 ? ` · +${slip} يوم عن Baseline` : ""}
                    </p>
                  </button>
                  <div
                    className="relative min-h-14 overflow-hidden border-b border-border"
                    style={{
                      width: timelineWidth,
                      backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayWidth - 1}px, var(--color-border) ${dayWidth}px)`,
                    }}
                  >
                    {todayLeft >= 0 && todayLeft <= timelineWidth && (
                      <div
                        className="absolute inset-y-0 z-10 w-px bg-danger/60"
                        style={{ left: todayLeft }}
                        title="اليوم"
                      />
                    )}
                    {baselineWidth > 0 && (
                      <div
                        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full border border-info/50 bg-info/10"
                        style={{
                          left: baselineLeft,
                          width: baselineWidth,
                        }}
                        title="Baseline"
                      />
                    )}
                    {item.node.kind === "milestone" ? (
                      <div
                        className={
                          conflict
                            ? "absolute top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-2 border-danger bg-danger/20"
                            : "absolute top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-2 border-brand bg-brand/20"
                        }
                        style={{ left }}
                      />
                    ) : (
                      <div
                        className={
                          conflict
                            ? "absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md border border-danger/50 bg-danger/20"
                            : item.node.status === "done"
                              ? "absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md border border-success/40 bg-success/20"
                              : "absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md border border-brand/40 bg-brand/15"
                        }
                        style={{ left, width }}
                      >
                        <div
                          className="h-full bg-brand/35"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, item.node.progress),
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                    {conflict && (
                      <AlertTriangle
                        className="absolute top-1 h-3.5 w-3.5 text-danger"
                        style={{ left: Math.max(0, left - 16) }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedItem && (
        <div className="border-t border-border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold">{selectedItem.node.title}</p>
              <p className="text-[9px] text-muted-foreground">
                عدّل التاريخ والجهد من نفس مصدر بيانات الـCanvas.
              </p>
            </div>
            <Link
              to="/project/$projectId/board/$boardId"
              params={{ projectId, boardId: selectedItem.board_id }}
              search={{ node: selectedItem.node.id }}
              className="text-[10px] font-medium text-brand hover:underline"
            >
              فتح في اللوحة
            </Link>
          </div>
          <ScheduleEditor
            projectId={projectId}
            item={selectedItem}
            effort={effortMap.get(selectedItem.node.id) ?? null}
            canEdit={canEdit}
          />
          {(dependencyBySource.get(selectedItem.node.id) ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(dependencyBySource.get(selectedItem.node.id) ?? []).map(
                (dependency) => (
                  <span
                    key={dependency.target_node_id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[9px] text-muted-foreground"
                  >
                    <GitBranch className="h-3 w-3" />
                    يعتمد على {dependency.target_title}
                    {dependency.target_due_date
                      ? ` · ${formatDate(dependency.target_due_date)}`
                      : ""}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="border-t border-border p-4">
          <h4 className="text-xs font-semibold">عناصر بدون جدول زمني</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {unscheduled.slice(0, 20).map((item) => (
              <button
                key={item.node.id}
                type="button"
                onClick={() => setSelected(item.node.id)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] hover:bg-muted"
              >
                {item.node.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CapacityView({
  projectId,
  summary,
  collaborators,
  planning,
  canManage,
}: {
  projectId: string;
  summary: ProjectExecutionSummary;
  collaborators: ProjectCollaborator[];
  planning: ProjectPlanningData;
  canManage: boolean;
}) {
  const setCapacity = useSetProjectMemberCapacity(projectId);
  const effortMap = new Map(
    planning.effort.map((row) => [row.node_id, row.effort_hours]),
  );
  const capacityMap = new Map(
    planning.capacity.map((row) => [
      row.user_id,
      row.weekly_capacity_hours,
    ]),
  );
  const currentWeek = startOfWeek(localTodayUtc());
  const weeks = Array.from({ length: 8 }, (_, index) =>
    addDays(currentWeek, index * 7),
  );

  const allocation = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const item of summary.items) {
      if (
        item.node.status === "done" ||
        !item.node.assignee_user_id ||
        !item.node.start_date ||
        !item.node.due_date
      ) continue;
      const effort = effortMap.get(item.node.id);
      if (!effort || effort <= 0) continue;
      const workdays = workingDayKeys(
        item.node.start_date,
        item.node.due_date,
      );
      const perDay = effort / workdays.length;
      for (const dayKey of workdays) {
        const weekKey = dateKey(startOfWeek(dateFromKey(dayKey)));
        const member =
          result.get(item.node.assignee_user_id) ?? new Map<string, number>();
        member.set(weekKey, (member.get(weekKey) ?? 0) + perDay);
        result.set(item.node.assignee_user_id, member);
      }
    }
    return result;
  }, [summary.items, planning.effort]);

  const executors = collaborators.filter((member) => member.role !== "viewer");

  return (
    <div className="p-4">
      <div className="mb-4 rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        السعة الافتراضية 40 ساعة/أسبوع حتى يغيرها المدير. توزيع الجهد يتم فقط للمهام التي لديها
        مسؤول + بداية + استحقاق + effort_hours، وعلى أيام العمل الأحد–الخميس. المهام غير المقدرة
        لا تتحول إلى ساعات افتراضية.
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[220px_repeat(8,1fr)] bg-muted/25 text-[9px] text-muted-foreground">
            <div className="border-e border-border px-3 py-2">عضو الفريق</div>
            {weeks.map((week) => (
              <div key={dateKey(week)} className="border-e border-border px-2 py-2 text-center">
                {formatWeek(week)}
              </div>
            ))}
          </div>

          {executors.map((member) => {
            const capacity = capacityMap.get(member.user_id) ?? 40;
            const memberAllocation = allocation.get(member.user_id);
            const openTasks = summary.items.filter(
              (item) =>
                item.node.assignee_user_id === member.user_id &&
                item.node.status !== "done",
            );
            const unestimated = openTasks.filter(
              (item) => !effortMap.get(item.node.id),
            ).length;
            return (
              <div
                key={member.user_id}
                className="grid grid-cols-[220px_repeat(8,1fr)] border-t border-border"
              >
                <div className="border-e border-border p-3">
                  <p className="truncate text-xs font-semibold">{member.full_name}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      key={member.user_id + ":" + capacity}
                      type="number"
                      min={0}
                      max={168}
                      defaultValue={capacity}
                      disabled={!canManage || setCapacity.isPending}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (
                          Number.isFinite(value) &&
                          value >= 0 &&
                          value <= 168 &&
                          value !== capacity
                        ) {
                          setCapacity.mutate({
                            userId: member.user_id,
                            weeklyCapacityHours: value,
                          });
                        } else {
                          event.currentTarget.value = String(capacity);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="w-16 rounded border border-border bg-background px-1.5 py-1 text-[9px]"
                    />
                    <span className="text-[9px] text-muted-foreground">ساعة/أسبوع</span>
                  </div>
                  {unestimated > 0 && (
                    <p className="mt-1 text-[9px] text-warning">
                      {unestimated} مهمة بدون جهد مقدّر
                    </p>
                  )}
                </div>

                {weeks.map((week) => {
                  const used =
                    memberAllocation?.get(dateKey(week)) ?? 0;
                  const ratio = capacity > 0 ? used / capacity : 0;
                  return (
                    <div
                      key={dateKey(week)}
                      className="border-e border-border p-2 text-center"
                    >
                      <div
                        className={
                          ratio > 1
                            ? "rounded-lg bg-danger/10 p-2 text-danger"
                            : ratio >= 0.85
                              ? "rounded-lg bg-warning/10 p-2 text-warning"
                              : "rounded-lg bg-success/5 p-2 text-foreground"
                        }
                      >
                        <p className="text-xs font-semibold">
                          {used.toFixed(1)}h
                        </p>
                        <p className="mt-0.5 text-[8px] opacity-70">
                          {Math.round(ratio * 100)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BaselineView({
  projectId,
  summary,
  planning,
  canManage,
}: {
  projectId: string;
  summary: ProjectExecutionSummary;
  planning: ProjectPlanningData;
  canManage: boolean;
}) {
  const createBaseline = useCreateProjectScheduleBaseline(projectId);
  const [name, setName] = useState("");
  const effortMap = new Map(
    planning.effort.map((row) => [row.node_id, row.effort_hours]),
  );
  const currentMap = new Map(
    summary.items
      .filter(
        (item) => item.node.kind === "task" || item.node.kind === "milestone",
      )
      .map((item) => [item.node.id, item] as const),
  );
  const baselineMap = new Map(
    (planning.latest_baseline?.items ?? []).map((item) => [
      item.node_id,
      item,
    ]),
  );

  let delayed = 0;
  let earlier = 0;
  let unchanged = 0;
  for (const [nodeId, baseline] of baselineMap) {
    const current = currentMap.get(nodeId);
    if (!current?.node.due_date || !baseline.due_date) continue;
    if (current.node.due_date > baseline.due_date) delayed += 1;
    else if (current.node.due_date < baseline.due_date) earlier += 1;
    else unchanged += 1;
  }
  const added = [...currentMap.keys()].filter((id) => !baselineMap.has(id)).length;
  const removed = [...baselineMap.keys()].filter((id) => !currentMap.has(id)).length;

  const localItems: ProjectScheduleBaselineItem[] = [...currentMap.values()].map(
    (item) => ({
      board_id: item.board_id,
      node_id: item.node.id,
      title: item.node.title,
      kind: item.node.kind,
      start_date: item.node.start_date,
      due_date: item.node.due_date,
      status: item.node.status,
      progress: item.node.progress,
      assignee_user_id: item.node.assignee_user_id,
      effort_hours: effortMap.get(item.node.id) ?? null,
    }),
  );

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="grid gap-2 sm:grid-cols-5">
          <div className="rounded-xl bg-danger/10 p-3 text-center">
            <p className="text-xl font-semibold text-danger">{delayed}</p>
            <p className="text-[9px] text-muted-foreground">تأخرت عن Baseline</p>
          </div>
          <div className="rounded-xl bg-success/10 p-3 text-center">
            <p className="text-xl font-semibold text-success">{earlier}</p>
            <p className="text-[9px] text-muted-foreground">تقدمت زمنيًا</p>
          </div>
          <div className="rounded-xl bg-muted p-3 text-center">
            <p className="text-xl font-semibold">{unchanged}</p>
            <p className="text-[9px] text-muted-foreground">بدون تغير</p>
          </div>
          <div className="rounded-xl bg-info/10 p-3 text-center">
            <p className="text-xl font-semibold text-info">{added}</p>
            <p className="text-[9px] text-muted-foreground">أضيفت بعد Baseline</p>
          </div>
          <div className="rounded-xl bg-warning/10 p-3 text-center">
            <p className="text-xl font-semibold text-warning">{removed}</p>
            <p className="text-[9px] text-muted-foreground">لم تعد موجودة</p>
          </div>
        </div>

        {planning.latest_baseline ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="bg-muted/25 px-3 py-2">
              <p className="text-xs font-semibold">{planning.latest_baseline.name}</p>
              <p className="text-[9px] text-muted-foreground">
                {new Date(planning.latest_baseline.created_at).toLocaleString("ar-SA")}
              </p>
            </div>
            {[...baselineMap.values()].slice(0, 30).map((baseline) => {
              const current = currentMap.get(baseline.node_id);
              const slip =
                current?.node.due_date && baseline.due_date
                  ? diffDays(
                      dateFromKey(baseline.due_date),
                      dateFromKey(current.node.due_date),
                    )
                  : null;
              return (
                <div
                  key={baseline.node_id}
                  className="grid gap-2 border-t border-border px-3 py-2 text-[10px] md:grid-cols-[minmax(0,1fr)_130px_130px_100px]"
                >
                  <span className="truncate font-medium">{baseline.title}</span>
                  <span>Baseline: {formatDate(baseline.due_date)}</span>
                  <span>حالي: {formatDate(current?.node.due_date ?? null)}</span>
                  <span
                    className={
                      slip == null
                        ? "text-muted-foreground"
                        : slip > 0
                          ? "text-danger"
                          : slip < 0
                            ? "text-success"
                            : "text-muted-foreground"
                    }
                  >
                    {slip == null
                      ? "—"
                      : slip > 0
                        ? `+${slip} يوم`
                        : slip < 0
                          ? `${slip} يوم`
                          : "مطابق"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
            <Flag className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-semibold">لا يوجد Baseline بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">
              احفظ الخطة الحالية كنقطة مرجعية لقياس الانحراف لاحقًا.
            </p>
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">حفظ Baseline جديد</h3>
        <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
          يحفظ التواريخ والحالة والتقدم والمسؤول والجهد لكل مهمة ومعلم في لحظة الإنشاء.
        </p>
        <input
          value={name}
          disabled={!canManage || createBaseline.isPending}
          onChange={(event) => setName(event.target.value)}
          placeholder="مثال: الخطة المعتمدة - سبتمبر"
          className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
        />
        <button
          type="button"
          disabled={
            !canManage ||
            createBaseline.isPending ||
            !name.trim()
          }
          onClick={() =>
            createBaseline.mutate(
              { name: name.trim(), localItems },
              { onSuccess: () => setName("") },
            )
          }
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          حفظ Baseline
        </button>

        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[10px] font-semibold">السجل</p>
          <div className="mt-2 space-y-2">
            {planning.baselines.slice(0, 8).map((baseline) => (
              <div key={baseline.id} className="rounded-lg bg-muted/30 p-2">
                <p className="text-[10px] font-medium">{baseline.name}</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  {baseline.item_count} عنصر · {baseline.created_by_name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ProjectPlanningCenter({
  projectId,
  summary,
  boards,
  collaborators,
  canEdit,
  canManage,
}: {
  projectId: string;
  summary: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
  canEdit: boolean;
  canManage: boolean;
}) {
  const planning = useProjectPlanningData(projectId);
  const [tab, setTab] = useState<PlanningTab>("gantt");

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-5 w-5 text-brand" />
              التخطيط المتقدم
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Gantt وBaseline والسعة من نفس مهام الـCanvas الحالية.
            </p>
          </div>
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {([
              ["gantt", "Gantt / Roadmap", CalendarDays],
              ["capacity", "Capacity", UsersRound],
              ["baseline", "Baseline", BarChart3],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setTab(value as PlanningTab)}
                className={
                  tab === value
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[10px] font-semibold text-primary-foreground"
                    : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {planning.isLoading || !planning.data ? (
        <div className="grid min-h-60 place-items-center p-8">
          <div className="text-center">
            <Clock3 className="mx-auto h-8 w-8 animate-pulse text-brand" />
            <p className="mt-2 text-xs text-muted-foreground">
              جاري تحميل بيانات التخطيط…
            </p>
          </div>
        </div>
      ) : tab === "gantt" ? (
        <GanttView
          projectId={projectId}
          summary={summary}
          boards={boards}
          planning={planning.data}
          canEdit={canEdit}
        />
      ) : tab === "capacity" ? (
        <CapacityView
          projectId={projectId}
          summary={summary}
          collaborators={collaborators}
          planning={planning.data}
          canManage={canManage}
        />
      ) : (
        <BaselineView
          projectId={projectId}
          summary={summary}
          planning={planning.data}
          canManage={canManage}
        />
      )}
    </section>
  );
}

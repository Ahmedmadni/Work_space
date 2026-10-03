import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  Gauge,
  Layers3,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";

import { arabicNumber } from "@/lib/format";
import type {
  BoardWithContext,
  Project,
  ProjectExecutionItem,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectPlanningData } from "@/types/planning";

interface ResourceWeek {
  week_key: string;
  hours: number;
  projects: Map<string, number>;
}

interface PortfolioResource {
  key: string;
  user_id: string | null;
  name: string;
  project_ids: Set<string>;
  capacity_values: number[];
  capacity: number | null;
  capacity_conflict: boolean;
  weeks: Map<string, ResourceWeek>;
  open_items: number;
  unestimated_items: number;
  unscheduled_items: number;
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

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getUTCDay());
}

function localTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
}

function formatWeek(date: Date) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(date);
}

function workingDayKeys(start: string, due: string) {
  const a = dateFromKey(start);
  const b = dateFromKey(due);
  const days: string[] = [];
  const length = Math.max(0, diffDays(a, b));
  for (let index = 0; index <= length; index += 1) {
    const current = addDays(a, index);
    const weekday = current.getUTCDay();
    if (weekday !== 5 && weekday !== 6) days.push(dateKey(current));
  }
  return days.length ? days : [start];
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort(
    (a, b) => a - b,
  );
}

function itemProjectId(
  item: ProjectExecutionItem,
  boardProject: Map<string, string>,
) {
  return boardProject.get(item.board_id) ?? null;
}

function projectCapacity(
  planning: ProjectPlanningData | undefined,
  userId: string,
) {
  return (
    planning?.capacity.find((row) => row.user_id === userId)
      ?.weekly_capacity_hours ?? 40
  );
}

function buildResources(
  summary: ProjectExecutionSummary,
  boards: BoardWithContext[],
  planningByProject: Record<string, ProjectPlanningData>,
) {
  const boardProject = new Map(
    boards.map((board) => [board.id, board.project_id] as const),
  );
  const resources = new Map<string, PortfolioResource>();

  for (const item of summary.items) {
    if (item.node.status === "done") continue;

    const name = item.node.assignee_name ?? item.node.owner;
    const userId = item.node.assignee_user_id;
    const resourceKey = userId ?? (name ? `name:${name}` : null);
    if (!resourceKey || !name) continue;

    const projectId = itemProjectId(item, boardProject);
    if (!projectId) continue;

    const resource = resources.get(resourceKey) ?? {
      key: resourceKey,
      user_id: userId,
      name,
      project_ids: new Set<string>(),
      capacity_values: [],
      capacity: null,
      capacity_conflict: false,
      weeks: new Map<string, ResourceWeek>(),
      open_items: 0,
      unestimated_items: 0,
      unscheduled_items: 0,
    };

    resource.open_items += 1;
    resource.project_ids.add(projectId);

    if (userId) {
      resource.capacity_values.push(
        projectCapacity(planningByProject[projectId], userId),
      );
    }

    const effort = item.node.effort_hours;
    if (effort == null || effort <= 0) {
      resource.unestimated_items += 1;
      resources.set(resourceKey, resource);
      continue;
    }

    if (!item.node.start_date || !item.node.due_date) {
      resource.unscheduled_items += 1;
      resources.set(resourceKey, resource);
      continue;
    }

    const days = workingDayKeys(item.node.start_date, item.node.due_date);
    const perDay = effort / days.length;

    for (const dayKey of days) {
      const weekKey = dateKey(startOfWeek(dateFromKey(dayKey)));
      const week = resource.weeks.get(weekKey) ?? {
        week_key: weekKey,
        hours: 0,
        projects: new Map<string, number>(),
      };
      week.hours += perDay;
      week.projects.set(
        projectId,
        (week.projects.get(projectId) ?? 0) + perDay,
      );
      resource.weeks.set(weekKey, week);
    }

    resources.set(resourceKey, resource);
  }

  return [...resources.values()].map((resource) => {
    const capacityValues = uniqueNumbers(resource.capacity_values);
    return {
      ...resource,
      capacity_values: capacityValues,
      capacity: capacityValues.length === 1 ? capacityValues[0]! : null,
      capacity_conflict: capacityValues.length > 1,
    };
  });
}

function weekLoad(
  resource: PortfolioResource,
  weekKey: string,
) {
  const week = resource.weeks.get(weekKey);
  const hours = week?.hours ?? 0;
  const ratio =
    resource.capacity != null && resource.capacity > 0
      ? hours / resource.capacity
      : resource.capacity === 0 && hours > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  return { week, hours, ratio };
}

export function PortfolioCapacityCenter({
  summary,
  boards,
  projects,
  planningByProject,
  isLoading,
}: {
  summary: ProjectExecutionSummary;
  boards: BoardWithContext[];
  projects: Project[];
  planningByProject: Record<string, ProjectPlanningData>;
  isLoading: boolean;
}) {
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const currentWeek = useMemo(() => startOfWeek(localTodayUtc()), []);
  const weeks = useMemo(
    () => Array.from({ length: 8 }, (_, index) => addDays(currentWeek, index * 7)),
    [currentWeek],
  );
  const weekKeys = useMemo(() => weeks.map(dateKey), [weeks]);
  const resources = useMemo(
    () => buildResources(summary, boards, planningByProject),
    [summary, boards, planningByProject],
  );

  const analysis = useMemo(() => {
    let overloadedPeople = 0;
    let overloadedWeeks = 0;
    let nearCapacityWeeks = 0;
    let capacityConflicts = 0;
    let unestimated = 0;
    let unscheduled = 0;
    let crossProjectWeeks = 0;

    for (const resource of resources) {
      let personOverloaded = false;
      if (resource.capacity_conflict) capacityConflicts += 1;
      unestimated += resource.unestimated_items;
      unscheduled += resource.unscheduled_items;

      for (const key of weekKeys) {
        const { week, ratio } = weekLoad(resource, key);
        if ((week?.projects.size ?? 0) > 1) crossProjectWeeks += 1;
        if (!resource.capacity_conflict && ratio > 1) {
          overloadedWeeks += 1;
          personOverloaded = true;
        } else if (!resource.capacity_conflict && ratio >= 0.85) {
          nearCapacityWeeks += 1;
        }
      }

      if (personOverloaded) overloadedPeople += 1;
    }

    return {
      overloadedPeople,
      overloadedWeeks,
      nearCapacityWeeks,
      capacityConflicts,
      unestimated,
      unscheduled,
      crossProjectWeeks,
    };
  }, [resources, weekKeys]);

  const rankedResources = useMemo(
    () =>
      [...resources].sort((a, b) => {
        const maxRatio = (resource: PortfolioResource) =>
          resource.capacity_conflict
            ? -1
            : Math.max(
                0,
                ...weekKeys.map((key) => weekLoad(resource, key).ratio),
              );
        const ratioDelta = maxRatio(b) - maxRatio(a);
        if (ratioDelta !== 0) return ratioDelta;
        if (a.capacity_conflict !== b.capacity_conflict) {
          return a.capacity_conflict ? -1 : 1;
        }
        return b.open_items - a.open_items;
      }),
    [resources, weekKeys],
  );

  const metrics = [
    {
      label: "أشخاص فوق السعة",
      value: analysis.overloadedPeople,
      icon: AlertTriangle,
      className: "text-danger",
    },
    {
      label: "أسابيع فوق السعة",
      value: analysis.overloadedWeeks,
      icon: Gauge,
      className: "text-danger",
    },
    {
      label: "أسابيع قرب السعة",
      value: analysis.nearCapacityWeeks,
      icon: Clock3,
      className: "text-warning",
    },
    {
      label: "تداخل متعدد المشاريع",
      value: analysis.crossProjectWeeks,
      icon: Layers3,
      className: "text-info",
    },
    {
      label: "مهام بدون جهد",
      value: analysis.unestimated,
      icon: CalendarClock,
      className: "text-warning",
    },
    {
      label: "تعارضات السعة",
      value: analysis.capacityConflicts,
      icon: UsersRound,
      className: "text-warning",
    },
  ];

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Gauge className="h-5 w-5 animate-pulse text-brand" />
          جاري تجميع سعات التخطيط عبر المشاريع…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Gauge className="h-5 w-5 text-brand" />
          تخطيط السعة عبر المشاريع
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          توزيع effort_hours على أسابيع العمل وربطه بسعة العضو عبر كل المشاريع
          التي تظهر في محفظتك.
        </p>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        السعة الافتراضية داخل المشروع هي 40 ساعة/أسبوع وفق نموذج التخطيط الحالي.
        عندما تكون سعة الشخص مختلفة بين مشروعين لا يصدر النظام حكمًا بأنه متجاوز
        للسعة؛ يعرض «تعارض سعة» إلى أن يتم توحيد القيم. توزيع الجهد يتم فقط للمهام
        ذات المسؤول والبداية والاستحقاق وeffort_hours.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(({ label, value, icon: Icon, className }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${className}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{arabicNumber(value)}</p>
          </div>
        ))}
      </div>

      {!rankedResources.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <UserRound className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold">لا توجد مهام مفتوحة مسندة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ستظهر السعة هنا بمجرد إسناد مهام أو معالم لأعضاء الفريق.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-[250px_repeat(8,minmax(105px,1fr))] bg-muted/25 text-[9px] text-muted-foreground">
              <div className="border-e border-border px-3 py-2">المسؤول / السعة</div>
              {weeks.map((week) => (
                <div
                  key={dateKey(week)}
                  className="border-e border-border px-2 py-2 text-center"
                >
                  أسبوع {formatWeek(week)}
                </div>
              ))}
            </div>

            {rankedResources.map((resource) => (
              <div
                key={resource.key}
                className="grid grid-cols-[250px_repeat(8,minmax(105px,1fr))] border-t border-border"
              >
                <div className="border-e border-border p-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {resource.name}
                    </p>
                  </div>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {arabicNumber(resource.open_items)} عنصر مفتوح ·{" "}
                    {arabicNumber(resource.project_ids.size)} مشروع
                  </p>

                  {resource.capacity_conflict ? (
                    <div className="mt-2 rounded-lg bg-warning/10 px-2 py-1.5 text-[9px] text-warning">
                      تعارض سعة: {resource.capacity_values.map((value) => `${value}h`).join(" / ")}
                    </div>
                  ) : (
                    <p className="mt-2 text-[9px] text-muted-foreground">
                      السعة:{" "}
                      <strong className="text-foreground">
                        {resource.capacity ?? 40}h / أسبوع
                      </strong>
                    </p>
                  )}

                  {(resource.unestimated_items > 0 ||
                    resource.unscheduled_items > 0) && (
                    <div className="mt-2 space-y-1 text-[9px]">
                      {resource.unestimated_items > 0 && (
                        <p className="text-warning">
                          {arabicNumber(resource.unestimated_items)} بدون effort_hours
                        </p>
                      )}
                      {resource.unscheduled_items > 0 && (
                        <p className="text-warning">
                          {arabicNumber(resource.unscheduled_items)} بدون جدول زمني مكتمل
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {weekKeys.map((key) => {
                  const { week, hours, ratio } = weekLoad(resource, key);
                  const projectEntries = [...(week?.projects.entries() ?? [])].sort(
                    (a, b) => b[1] - a[1],
                  );
                  const overloaded =
                    !resource.capacity_conflict && ratio > 1;
                  const near =
                    !resource.capacity_conflict && ratio >= 0.85 && ratio <= 1;
                  const multipleProjects = projectEntries.length > 1;

                  return (
                    <div key={key} className="border-e border-border p-2">
                      <div
                        className={
                          resource.capacity_conflict && hours > 0
                            ? "min-h-[78px] rounded-lg bg-warning/10 p-2 text-warning"
                            : overloaded
                              ? "min-h-[78px] rounded-lg bg-danger/10 p-2 text-danger"
                              : near
                                ? "min-h-[78px] rounded-lg bg-warning/10 p-2 text-warning"
                                : hours > 0
                                  ? "min-h-[78px] rounded-lg bg-success/5 p-2 text-foreground"
                                  : "min-h-[78px] rounded-lg bg-muted/20 p-2 text-muted-foreground"
                        }
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold">{hours.toFixed(1)}h</p>
                          {multipleProjects && (
                            <Layers3 className="h-3 w-3 shrink-0 opacity-70" />
                          )}
                        </div>

                        <p className="mt-0.5 text-[8px] opacity-70">
                          {resource.capacity_conflict
                            ? hours > 0
                              ? "السعة غير موحدة"
                              : "—"
                            : resource.capacity === 0 && hours > 0
                              ? "بدون سعة"
                              : `${Math.round(ratio * 100)}%`}
                        </p>

                        {projectEntries.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {projectEntries.slice(0, 2).map(([projectId, projectHours]) => (
                              <Link
                                key={projectId}
                                to="/project/$projectId"
                                params={{ projectId }}
                                className="block truncate text-[8px] opacity-75 hover:underline"
                                title={projectMap.get(projectId)?.name ?? projectId}
                              >
                                {projectMap.get(projectId)?.name ?? "مشروع"} ·{" "}
                                {projectHours.toFixed(1)}h
                              </Link>
                            ))}
                            {projectEntries.length > 2 && (
                              <p className="text-[8px] opacity-60">
                                +{arabicNumber(projectEntries.length - 2)} مشاريع
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.unscheduled > 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-[10px] leading-5 text-muted-foreground">
          هناك {arabicNumber(analysis.unscheduled)} عناصر لديها effort_hours لكنها لا
          تملك بداية واستحقاقًا كاملين، لذلك لم تدخل ساعاتها في الجدول الأسبوعي حتى لا
          يتم توزيعها على تواريخ افتراضية.
        </div>
      )}
    </section>
  );
}

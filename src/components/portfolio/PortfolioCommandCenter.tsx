import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flag,
  FolderKanban,
  Gauge,
  Milestone,
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

type PortfolioHealth = "stable" | "follow_up" | "intervention";

interface ProjectPortfolioRow {
  project: Project;
  board_count: number;
  total: number;
  completed: number;
  open: number;
  overdue: number;
  blocked: number;
  critical: number;
  unassigned: number;
  waiting: number;
  upcoming: number;
  average_progress: number;
  critical_blocked: number;
  critical_overdue: number;
  milestones_total: number;
  milestones_completed: number;
  milestones_overdue: number;
  milestones_upcoming: number;
  health: PortfolioHealth;
  reasons: string[];
}

interface WorkloadRow {
  key: string;
  name: string;
  open: number;
  overdue: number;
  blocked: number;
  critical: number;
}

const HEALTH_META: Record<
  PortfolioHealth,
  { label: string; className: string; dotClassName: string; rank: number }
> = {
  intervention: {
    label: "يحتاج تدخل",
    className: "border-danger/20 bg-danger/5 text-danger",
    dotClassName: "bg-danger",
    rank: 0,
  },
  follow_up: {
    label: "يحتاج متابعة",
    className: "border-warning/20 bg-warning/5 text-warning",
    dotClassName: "bg-warning",
    rank: 1,
  },
  stable: {
    label: "مستقر",
    className: "border-success/20 bg-success/5 text-success",
    dotClassName: "bg-success",
    rank: 2,
  },
};

function formatDueDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function buildProjectRows(
  summary: ProjectExecutionSummary,
  boards: BoardWithContext[],
  projects: Project[],
): ProjectPortfolioRow[] {
  const boardProject = new Map(boards.map((board) => [board.id, board.project_id] as const));
  const itemsByProject = new Map<string, ProjectExecutionItem[]>();

  for (const item of summary.items) {
    const projectId = boardProject.get(item.board_id);
    if (!projectId) continue;
    const bucket = itemsByProject.get(projectId) ?? [];
    bucket.push(item);
    itemsByProject.set(projectId, bucket);
  }

  const rows = projects.map((project) => {
    const items = itemsByProject.get(project.id) ?? [];
    const completed = items.filter((item) => item.node.status === "done").length;
    const overdue = items.filter((item) => item.is_overdue).length;
    const blocked = items.filter((item) => item.node.status === "blocked").length;
    const critical = items.filter((item) => item.is_critical).length;
    const unassigned = items.filter((item) => item.is_unassigned).length;
    const waiting = items.filter((item) => item.waiting_on_dependencies).length;
    const upcoming = items.filter((item) => item.is_upcoming).length;
    const criticalBlocked = items.filter(
      (item) => item.is_critical && item.node.status === "blocked",
    ).length;
    const criticalOverdue = items.filter(
      (item) => item.is_critical && item.is_overdue,
    ).length;
    const milestones = items.filter((item) => item.node.kind === "milestone");
    const averageProgress = items.length
      ? Math.round(
          items.reduce((sum, item) => sum + item.node.progress, 0) / items.length,
        )
      : 0;

    const reasons: string[] = [];
    if (criticalBlocked) reasons.push(`${arabicNumber(criticalBlocked)} مهمة حرجة معطلة`);
    if (criticalOverdue) reasons.push(`${arabicNumber(criticalOverdue)} مهمة حرجة متأخرة`);
    if (overdue) reasons.push(`${arabicNumber(overdue)} متأخر`);
    if (blocked) reasons.push(`${arabicNumber(blocked)} معطل`);
    if (waiting) reasons.push(`${arabicNumber(waiting)} ينتظر اعتمادًا`);
    if (unassigned) reasons.push(`${arabicNumber(unassigned)} بدون مسؤول`);

    const health: PortfolioHealth =
      criticalBlocked > 0 || criticalOverdue > 0
        ? "intervention"
        : overdue > 0 || blocked > 0 || waiting > 0 || unassigned > 0
          ? "follow_up"
          : "stable";

    return {
      project,
      board_count: boards.filter((board) => board.project_id === project.id).length,
      total: items.length,
      completed,
      open: Math.max(0, items.length - completed),
      overdue,
      blocked,
      critical,
      unassigned,
      waiting,
      upcoming,
      average_progress: averageProgress,
      critical_blocked: criticalBlocked,
      critical_overdue: criticalOverdue,
      milestones_total: milestones.length,
      milestones_completed: milestones.filter((item) => item.node.status === "done").length,
      milestones_overdue: milestones.filter((item) => item.is_overdue).length,
      milestones_upcoming: milestones.filter((item) => item.is_upcoming).length,
      health,
      reasons,
    };
  });

  return rows.sort((a, b) => {
    const healthDelta = HEALTH_META[a.health].rank - HEALTH_META[b.health].rank;
    if (healthDelta !== 0) return healthDelta;
    if (a.critical_overdue !== b.critical_overdue) {
      return b.critical_overdue - a.critical_overdue;
    }
    if (a.critical_blocked !== b.critical_blocked) {
      return b.critical_blocked - a.critical_blocked;
    }
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    if (a.blocked !== b.blocked) return b.blocked - a.blocked;
    return a.project.name.localeCompare(b.project.name, "ar");
  });
}

function buildWorkload(summary: ProjectExecutionSummary): WorkloadRow[] {
  const rows = new Map<string, WorkloadRow>();

  for (const item of summary.items) {
    if (
      item.node.status === "done" ||
      (item.node.kind !== "task" && item.node.kind !== "milestone")
    ) {
      continue;
    }

    const name = item.node.assignee_name ?? item.node.owner;
    const key = item.node.assignee_user_id ?? (name ? `name:${name}` : null);
    if (!key || !name) continue;

    const row = rows.get(key) ?? {
      key,
      name,
      open: 0,
      overdue: 0,
      blocked: 0,
      critical: 0,
    };

    row.open += 1;
    if (item.is_overdue) row.overdue += 1;
    if (item.node.status === "blocked") row.blocked += 1;
    if (item.is_critical) row.critical += 1;
    rows.set(key, row);
  }

  return [...rows.values()]
    .sort((a, b) => {
      const riskA = a.overdue + a.blocked + a.critical;
      const riskB = b.overdue + b.blocked + b.critical;
      if (riskA !== riskB) return riskB - riskA;
      return b.open - a.open;
    })
    .slice(0, 8);
}

function attentionRank(item: ProjectExecutionItem) {
  if (item.is_critical && item.is_overdue) return 0;
  if (item.is_critical && item.node.status === "blocked") return 1;
  if (item.is_overdue) return 2;
  if (item.node.status === "blocked") return 3;
  if (item.is_critical) return 4;
  if (item.waiting_on_dependencies) return 5;
  if (item.is_upcoming) return 6;
  return 7;
}

export function PortfolioCommandCenter({
  summary,
  boards,
  projects,
}: {
  summary: ProjectExecutionSummary;
  boards: BoardWithContext[];
  projects: Project[];
}) {
  const boardMap = useMemo(
    () => new Map(boards.map((board) => [board.id, board] as const)),
    [boards],
  );
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const rows = useMemo(
    () => buildProjectRows(summary, boards, projects),
    [summary, boards, projects],
  );
  const workload = useMemo(() => buildWorkload(summary), [summary]);

  const attention = useMemo(
    () =>
      summary.items
        .filter(
          (item) =>
            item.is_overdue ||
            item.node.status === "blocked" ||
            item.is_critical ||
            item.waiting_on_dependencies ||
            item.is_upcoming,
        )
        .sort((a, b) => {
          const rankDelta = attentionRank(a) - attentionRank(b);
          if (rankDelta !== 0) return rankDelta;
          return (a.node.due_date ?? "9999-12-31").localeCompare(
            b.node.due_date ?? "9999-12-31",
          );
        })
        .slice(0, 10),
    [summary.items],
  );

  const stableProjects = rows.filter((row) => row.health === "stable").length;
  const followUpProjects = rows.filter((row) => row.health === "follow_up").length;
  const interventionProjects = rows.filter(
    (row) => row.health === "intervention",
  ).length;
  const milestones = summary.items.filter((item) => item.node.kind === "milestone");
  const openMilestones = milestones.filter((item) => item.node.status !== "done");
  const overdueMilestones = openMilestones.filter((item) => item.is_overdue).length;
  const upcomingMilestones = openMilestones.filter((item) => item.is_upcoming).length;

  const portfolioMetrics = [
    {
      label: "مشاريع مستقرة",
      value: stableProjects,
      icon: CheckCircle2,
      className: "text-success",
    },
    {
      label: "تحتاج متابعة",
      value: followUpProjects,
      icon: Gauge,
      className: "text-warning",
    },
    {
      label: "تحتاج تدخل",
      value: interventionProjects,
      icon: AlertTriangle,
      className: "text-danger",
    },
    {
      label: "عناصر متأخرة",
      value: summary.overdue,
      icon: Clock3,
      className: "text-danger",
    },
    {
      label: "عناصر حرجة",
      value: summary.critical,
      icon: Flag,
      className: "text-warning",
    },
    {
      label: "Milestones مفتوحة",
      value: openMilestones.length,
      icon: Milestone,
      className: "text-info",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FolderKanban className="h-5 w-5 text-brand" />
            مركز قيادة المحفظة
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            صورة موحدة عبر كل المشاريع مع قواعد واضحة للحالة وأقرب نقاط التدخل.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          متوسط الإنجاز عبر المحفظة
          <strong className="ms-1 text-foreground">{summary.average_progress}%</strong>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {portfolioMetrics.map(({ label, value, icon: Icon, className }) => (
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

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">حالة المشاريع</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              «يحتاج تدخل» يظهر فقط عند وجود عنصر حرج متأخر أو حرج معطل. أما التأخير
              والتعطل والاعتمادات وغياب المسؤول فتظهر كـ«يحتاج متابعة».
            </p>
          </div>

          {!rows.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد مشاريع لعرضها.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.slice(0, 12).map((row) => {
                const meta = HEALTH_META[row.health];
                return (
                  <Link
                    key={row.project.id}
                    to="/project/$projectId"
                    params={{ projectId: row.project.id }}
                    className="block px-4 py-4 transition hover:bg-muted/35"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {row.project.name}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] ${meta.className}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${meta.dotClassName}`}
                            />
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {arabicNumber(row.board_count)} لوحات · {arabicNumber(row.open)} مفتوح ·
                          متوسط الإنجاز {row.average_progress}%
                        </p>
                        {row.reasons.length > 0 && (
                          <p className="mt-1.5 line-clamp-1 text-[10px] text-muted-foreground">
                            {row.reasons.slice(0, 4).join(" · ")}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2 xl:w-[360px]">
                        <div className="rounded-lg bg-danger/5 px-2 py-1.5 text-center">
                          <p className="text-xs font-semibold text-danger">
                            {arabicNumber(row.overdue)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">متأخر</p>
                        </div>
                        <div className="rounded-lg bg-warning/5 px-2 py-1.5 text-center">
                          <p className="text-xs font-semibold text-warning">
                            {arabicNumber(row.blocked)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">معطل</p>
                        </div>
                        <div className="rounded-lg bg-info/5 px-2 py-1.5 text-center">
                          <p className="text-xs font-semibold text-info">
                            {arabicNumber(row.milestones_upcoming)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">Milestone قريب</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                          <p className="text-xs font-semibold">
                            {arabicNumber(row.unassigned)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">بدون مسؤول</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <Milestone className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Milestones عبر المشاريع</h3>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-muted/40 p-3 text-center">
              <p className="text-xl font-semibold">{arabicNumber(openMilestones.length)}</p>
              <p className="text-[9px] text-muted-foreground">مفتوحة</p>
            </div>
            <div className="rounded-xl bg-danger/8 p-3 text-center">
              <p className="text-xl font-semibold text-danger">
                {arabicNumber(overdueMilestones)}
              </p>
              <p className="text-[9px] text-muted-foreground">متأخرة</p>
            </div>
            <div className="rounded-xl bg-info/8 p-3 text-center">
              <p className="text-xl font-semibold text-info">
                {arabicNumber(upcomingMilestones)}
              </p>
              <p className="text-[9px] text-muted-foreground">خلال 7 أيام</p>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="text-[10px] font-semibold">الإنجاز العام</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${summary.average_progress}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex justify-between rounded-lg bg-muted/30 px-2 py-1.5">
                <span className="text-muted-foreground">إجمالي العناصر</span>
                <strong>{arabicNumber(summary.total)}</strong>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-2 py-1.5">
                <span className="text-muted-foreground">مكتمل</span>
                <strong>{arabicNumber(summary.completed)}</strong>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-2 py-1.5">
                <span className="text-muted-foreground">قيد التنفيذ</span>
                <strong>{arabicNumber(summary.in_progress)}</strong>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-2 py-1.5">
                <span className="text-muted-foreground">ينتظر اعتمادًا</span>
                <strong>{arabicNumber(summary.waiting_on_dependencies)}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">الأولوية الآن</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                العناصر الأعلى احتياجًا للمتابعة عبر كل المشاريع.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {attention.length ? `${arabicNumber(attention.length)} عناصر` : "لا توجد تنبيهات"}
            </span>
          </div>

          {!attention.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
              لا توجد عناصر متأخرة أو معطلة أو حرجة حاليًا.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {attention.map((item) => {
                const board = boardMap.get(item.board_id);
                if (!board) return null;
                const project = projectMap.get(board.project_id);
                return (
                  <Link
                    key={`${item.board_id}:${item.node.id}`}
                    to="/project/$projectId/board/$boardId"
                    params={{ projectId: board.project_id, boardId: board.id }}
                    search={{ node: item.node.id }}
                    className="flex flex-col gap-2 bg-background px-3 py-3 transition hover:bg-muted/50 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.node.title}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {project?.name ?? board.project_name} · {board.name}
                        {item.node.assignee_name || item.node.owner
                          ? ` · ${item.node.assignee_name ?? item.node.owner}`
                          : " · بدون مسؤول"}
                        {item.node.due_date ? ` · ${formatDueDate(item.node.due_date)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.is_overdue && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                          متأخر
                        </span>
                      )}
                      {item.node.status === "blocked" && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                          معطل
                        </span>
                      )}
                      {item.is_critical && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
                          حرج
                        </span>
                      )}
                      {item.waiting_on_dependencies && (
                        <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] text-info">
                          ينتظر {arabicNumber(item.waiting_on.length)}
                        </span>
                      )}
                      {item.is_upcoming && !item.is_overdue && (
                        <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] text-info">
                          قريب
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">حمل التنفيذ عبر المشاريع</h3>
          </div>
          <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
            عدّاد للمهام والمعالم المفتوحة حسب المسؤول. لا يحوّل عدد المهام إلى ساعات ولا
            يفترض Capacity غير مسجلة.
          </p>

          {!workload.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              لا توجد مهام مفتوحة مسندة حاليًا.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {workload.map((row) => (
                <div key={row.key} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">{row.name}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {arabicNumber(row.open)} مفتوح
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                    {row.overdue > 0 && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                        {arabicNumber(row.overdue)} متأخر
                      </span>
                    )}
                    {row.blocked > 0 && (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                        {arabicNumber(row.blocked)} معطل
                      </span>
                    )}
                    {row.critical > 0 && (
                      <span className="rounded-full bg-info/10 px-2 py-0.5 text-info">
                        {arabicNumber(row.critical)} حرج
                      </span>
                    )}
                    {row.overdue === 0 && row.blocked === 0 && row.critical === 0 && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                        لا توجد إشارات خطر
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Flag,
  ListTodo,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useSetCanvasNodeAssignee,
  useUpdateCanvasNodeExecution,
} from "@/hooks/use-task-execution";
import type {
  BoardWithContext,
  CanvasNodeStatus,
  CanvasPriority,
  ProjectExecutionItem,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";

type ExecutionView =
  | "mine"
  | "team"
  | "overdue"
  | "due_week"
  | "blocked"
  | "unassigned";

const STATUS_OPTIONS: Array<{
  value: CanvasNodeStatus;
  label: string;
}> = [
  { value: "idea", label: "فكرة" },
  { value: "planned", label: "مخطط" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "done", label: "مكتمل" },
  { value: "blocked", label: "معطل" },
];

const PRIORITY_OPTIONS: Array<{
  value: CanvasPriority;
  label: string;
}> = [
  { value: "critical", label: "حرجة" },
  { value: "high", label: "عالية" },
  { value: "medium", label: "متوسطة" },
  { value: "low", label: "منخفضة" },
];

function formatLocalDate(value: string | null) {
  if (!value) return "بدون تاريخ";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function statusLabel(status: CanvasNodeStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function priorityLabel(priority: CanvasPriority | null) {
  return priority
    ? PRIORITY_OPTIONS.find((item) => item.value === priority)?.label ??
        priority
    : "بدون أولوية";
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "م") + (parts[1]?.[0] ?? "")).slice(0, 2);
}

function TaskRow({
  projectId,
  item,
  board,
  collaborators,
  canEdit,
}: {
  projectId: string;
  item: ProjectExecutionItem;
  board: BoardWithContext;
  collaborators: ProjectCollaborator[];
  canEdit: boolean;
}) {
  const updateExecution = useUpdateCanvasNodeExecution(
    projectId,
    item.board_id,
    item.node.id,
  );
  const setAssignee = useSetCanvasNodeAssignee(
    projectId,
    item.board_id,
    item.node.id,
  );
  const assignableMembers = collaborators.filter(
    (member) => member.role !== "viewer",
  );
  const busy = updateExecution.isPending || setAssignee.isPending;

  return (
    <div className="grid gap-3 border-t border-border px-3 py-3 first:border-t-0 lg:grid-cols-[minmax(220px,1fr)_150px_145px_145px_130px] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
            {board.name}
          </span>
          {item.is_overdue && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[9px] font-medium text-danger">
              متأخرة
            </span>
          )}
          {item.is_upcoming && !item.is_overdue && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-medium text-warning">
              استحقاق قريب
            </span>
          )}
          {item.waiting_on_dependencies && (
            <span className="rounded-full bg-info/10 px-2 py-0.5 text-[9px] text-info">
              ينتظر {item.waiting_on.length}
            </span>
          )}
        </div>

        <Link
          to="/project/$projectId/board/$boardId"
          params={{
            projectId,
            boardId: item.board_id,
          }}
          search={{ node: item.node.id }}
          className="mt-1.5 block truncate text-sm font-semibold hover:text-brand"
        >
          {item.node.title}
        </Link>

        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{Math.round(item.node.progress)}%</span>
          <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, item.node.progress),
                )}%`,
              }}
            />
          </div>
          <span>{formatLocalDate(item.node.due_date)}</span>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[9px] text-muted-foreground lg:hidden">
          المسؤول
        </span>
        <select
          value={item.node.assignee_user_id ?? ""}
          disabled={!canEdit || busy}
          onChange={(event) => {
            const userId = event.target.value || null;
            const member = assignableMembers.find(
              (candidate) => candidate.user_id === userId,
            );
            setAssignee.mutate({
              assigneeUserId: userId,
              assigneeName: member?.full_name ?? null,
            });
          }}
          className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs outline-none focus:border-brand disabled:opacity-60"
          aria-label={`المسؤول عن ${item.node.title}`}
        >
          <option value="">بدون مسؤول</option>
          {assignableMembers.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.full_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[9px] text-muted-foreground lg:hidden">
          الحالة
        </span>
        <select
          value={item.node.status}
          disabled={!canEdit || busy}
          onChange={(event) =>
            updateExecution.mutate({
              expectedVersion: item.node.version ?? 1,
              status: event.target.value as CanvasNodeStatus,
            })
          }
          className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs outline-none focus:border-brand disabled:opacity-60"
          aria-label={`حالة ${item.node.title}`}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[9px] text-muted-foreground lg:hidden">
          الأولوية
        </span>
        <select
          value={item.node.priority ?? ""}
          disabled={!canEdit || busy}
          onChange={(event) =>
            updateExecution.mutate({
              expectedVersion: item.node.version ?? 1,
              priority: event.target.value
                ? (event.target.value as CanvasPriority)
                : null,
            })
          }
          className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs outline-none focus:border-brand disabled:opacity-60"
          aria-label={`أولوية ${item.node.title}`}
        >
          <option value="">بدون أولوية</option>
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </label>

      <div className="text-[10px] text-muted-foreground">
        <p className="font-medium text-foreground">
          {item.node.due_date
            ? formatLocalDate(item.node.due_date)
            : "بدون استحقاق"}
        </p>
        <p className="mt-1">
          {priorityLabel(item.node.priority)} · {statusLabel(item.node.status)}
        </p>
      </div>
    </div>
  );
}

export function ProjectExecutionCenter({
  projectId,
  summary,
  boards,
  collaborators,
  currentUserId,
  canEdit,
}: {
  projectId: string;
  summary: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
  currentUserId: string | null;
  canEdit: boolean;
}) {
  const [view, setView] = useState<ExecutionView>("mine");
  const [query, setQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  const boardMap = useMemo(
    () => new Map(boards.map((board) => [board.id, board] as const)),
    [boards],
  );
  const openItems = useMemo(
    () => summary.items.filter((item) => item.node.status !== "done"),
    [summary.items],
  );

  const counts = useMemo(
    () => ({
      mine: currentUserId
        ? openItems.filter(
            (item) => item.node.assignee_user_id === currentUserId,
          ).length
        : 0,
      team: openItems.length,
      overdue: openItems.filter((item) => item.is_overdue).length,
      due_week: openItems.filter((item) => item.is_upcoming).length,
      blocked: openItems.filter((item) => item.node.status === "blocked")
        .length,
      unassigned: openItems.filter((item) => item.is_unassigned).length,
    }),
    [openItems, currentUserId],
  );

  const workload = useMemo(
    () =>
      collaborators
        .filter((member) => member.role !== "viewer")
        .map((member) => {
          const tasks = openItems.filter(
            (item) => item.node.assignee_user_id === member.user_id,
          );
          const progress = tasks.length
            ? Math.round(
                tasks.reduce(
                  (total, item) => total + item.node.progress,
                  0,
                ) / tasks.length,
              )
            : 0;
          return {
            member,
            open: tasks.length,
            overdue: tasks.filter((item) => item.is_overdue).length,
            blocked: tasks.filter(
              (item) => item.node.status === "blocked",
            ).length,
            dueWeek: tasks.filter((item) => item.is_upcoming).length,
            progress,
          };
        })
        .sort((a, b) => {
          if (a.open !== b.open) return b.open - a.open;
          if (a.overdue !== b.overdue) return b.overdue - a.overdue;
          return a.member.full_name.localeCompare(
            b.member.full_name,
            "ar",
          );
        }),
    [collaborators, openItems],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    return openItems.filter((item) => {
      if (
        memberFilter &&
        item.node.assignee_user_id !== memberFilter
      ) {
        return false;
      }

      if (
        view === "mine" &&
        item.node.assignee_user_id !== currentUserId
      ) {
        return false;
      }
      if (view === "overdue" && !item.is_overdue) return false;
      if (view === "due_week" && !item.is_upcoming) return false;
      if (view === "blocked" && item.node.status !== "blocked") {
        return false;
      }
      if (view === "unassigned" && !item.is_unassigned) return false;

      if (!normalized) return true;
      const board = boardMap.get(item.board_id);
      const haystack = [
        item.node.title,
        item.node.description ?? "",
        item.node.assignee_name ?? item.node.owner ?? "",
        board?.name ?? "",
        item.node.tags.join(" "),
      ]
        .join(" ")
        .toLocaleLowerCase("ar");
      return haystack.includes(normalized);
    });
  }, [
    openItems,
    memberFilter,
    view,
    currentUserId,
    query,
    boardMap,
  ]);

  const tabs: Array<{
    value: ExecutionView;
    label: string;
    count: number;
    icon: typeof ListTodo;
  }> = [
    {
      value: "mine",
      label: "مهامي",
      count: counts.mine,
      icon: UserRound,
    },
    {
      value: "team",
      label: "مهام الفريق",
      count: counts.team,
      icon: UsersRound,
    },
    {
      value: "overdue",
      label: "متأخرة",
      count: counts.overdue,
      icon: AlertTriangle,
    },
    {
      value: "due_week",
      label: "هذا الأسبوع",
      count: counts.due_week,
      icon: CalendarClock,
    },
    {
      value: "blocked",
      label: "معطلة",
      count: counts.blocked,
      icon: Ban,
    },
    {
      value: "unassigned",
      label: "غير مسندة",
      count: counts.unassigned,
      icon: UserRound,
    },
  ];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ListTodo className="h-5 w-5 text-brand" />
              مركز تنفيذ المشروع
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              إدارة المسؤولية والحالة والأولوية لجميع عناصر التنفيذ من مكان واحد.
            </p>
          </div>

          <div className="relative w-full xl:w-80">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث في المهام واللوحات والمسؤولين…"
              className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-xs outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map(({ value, label, count, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setView(value);
                setMemberFilter(null);
              }}
              className={
                view === value && !memberFilter
                  ? "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground"
                  : "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span
                className={
                  view === value && !memberFilter
                    ? "rounded-full bg-primary-foreground/15 px-1.5 text-[9px]"
                    : "rounded-full bg-muted px-1.5 text-[9px]"
                }
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="hidden grid-cols-[minmax(220px,1fr)_150px_145px_145px_130px] gap-3 border-b border-border bg-muted/25 px-3 py-2 text-[9px] font-medium text-muted-foreground lg:grid">
            <span>المهمة</span>
            <span>المسؤول</span>
            <span>الحالة</span>
            <span>الأولوية</span>
            <span>الاستحقاق</span>
          </div>

          {memberFilter && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-brand/5 px-3 py-2">
              <span className="text-xs">
                عرض مهام{" "}
                <strong>
                  {collaborators.find(
                    (member) => member.user_id === memberFilter,
                  )?.full_name ?? "العضو"}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setMemberFilter(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
                إلغاء
              </button>
            </div>
          )}

          {!filtered.length ? (
            <div className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <CheckCircle2 className="mx-auto h-9 w-9 text-success/60" />
                <p className="mt-3 text-sm font-semibold">
                  لا توجد مهام مطابقة
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  غيّر طريقة العرض أو عبارة البحث للوصول إلى عناصر أخرى.
                </p>
              </div>
            </div>
          ) : (
            <div>
              {filtered.map((item) => {
                const board = boardMap.get(item.board_id);
                if (!board) return null;
                return (
                  <TaskRow
                    key={item.board_id + ":" + item.node.id}
                    projectId={projectId}
                    item={item}
                    board={board}
                    collaborators={collaborators}
                    canEdit={canEdit}
                  />
                );
              })}
            </div>
          )}
        </div>

        <aside className="border-t border-border bg-muted/10 p-4 xl:border-s xl:border-t-0">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">حمل العمل</h3>
              <p className="text-[10px] text-muted-foreground">
                المهام المفتوحة حسب عضو الفريق.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {workload.map((row) => (
              <button
                key={row.member.user_id}
                type="button"
                onClick={() => {
                  setMemberFilter(row.member.user_id);
                  setView("team");
                }}
                className={
                  memberFilter === row.member.user_id
                    ? "w-full rounded-xl border border-brand bg-brand/5 p-3 text-start"
                    : "w-full rounded-xl border border-border bg-background p-3 text-start transition hover:border-brand/35 hover:bg-muted/40"
                }
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold">
                    {initials(row.member.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {row.member.full_name}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {row.open} مفتوحة · {row.progress}% متوسط إنجاز
                    </p>
                  </div>
                  <strong className="text-lg">{row.open}</strong>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-1 text-center text-[9px]">
                  <div className="rounded-lg bg-danger/10 px-1 py-1.5 text-danger">
                    {row.overdue} متأخرة
                  </div>
                  <div className="rounded-lg bg-warning/10 px-1 py-1.5 text-warning">
                    {row.dueWeek} قريبة
                  </div>
                  <div className="rounded-lg bg-muted px-1 py-1.5 text-muted-foreground">
                    {row.blocked} معطلة
                  </div>
                </div>
              </button>
            ))}

            {!workload.length && (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                لا يوجد أعضاء تنفيذ بعد.
              </div>
            )}
          </div>

          {counts.unassigned > 0 && (
            <button
              type="button"
              onClick={() => {
                setMemberFilter(null);
                setView("unassigned");
              }}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-warning/30 bg-warning/5 p-3 text-start"
            >
              <span className="flex items-center gap-2 text-xs">
                <Flag className="h-4 w-4 text-warning" />
                عناصر تحتاج مسؤولًا
              </span>
              <strong className="text-warning">{counts.unassigned}</strong>
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

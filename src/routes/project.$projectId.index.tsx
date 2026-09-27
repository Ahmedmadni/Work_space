import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Flag,
  Link2,
  Plus,
  Search,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  BoardGrid,
  CardGridSkeleton,
  EmptyState,
  Glyph,
  NotFoundState,
  PageHeader,
  StatusBadge,
} from "@/components/app/shared";
import { CreateBoardDialog } from "@/components/app/dialogs";
import { ProjectShareDialog } from "@/components/collaboration/ProjectShareDialog";
import { useProject } from "@/hooks/use-projects";
import { useProjectAccess } from "@/hooks/use-collaboration";
import { useProjectPresence } from "@/hooks/use-live-collaboration";
import { useBoards } from "@/hooks/use-boards";
import { useCanvasNodeSearch, useProjectExecutionSummary } from "@/hooks/use-canvas";
import type {
  BoardWithContext,
  CanvasNodeStatus,
  CanvasPriority,
  ProjectExecutionSummary,
} from "@/types";

export const Route = createFileRoute("/project/$projectId/")({
  head: () => ({
    meta: [
      { title: "المشروع — ProjectFlow" },
      { name: "description", content: "لوحات العمل الخاصة بالمشروع." },
    ],
  }),
  component: ProjectDetail,
});

const NODE_STATUS_OPTIONS: Array<{ value: CanvasNodeStatus; label: string }> = [
  { value: "idea", label: "فكرة" },
  { value: "planned", label: "مخطط" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "done", label: "مكتمل" },
  { value: "blocked", label: "معطل" },
];

const PRIORITY_OPTIONS: Array<{ value: CanvasPriority; label: string }> = [
  { value: "critical", label: "حرجة" },
  { value: "high", label: "عالية" },
  { value: "medium", label: "متوسطة" },
  { value: "low", label: "منخفضة" },
];

const KIND_LABELS = {
  idea: "فكرة",
  task: "مهمة",
  milestone: "معلم",
  note: "ملاحظة",
  sticky: "ملاحظة",
  text: "نص",
  rectangle: "مستطيل",
  ellipse: "بيضاوي",
  image: "صورة",
} as const;


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

function ExecutionOverview({
  summary,
  boardMap,
  projectId,
}: {
  summary: ProjectExecutionSummary;
  boardMap: Map<string, BoardWithContext>;
  projectId: string;
}) {
  const metrics = [
    {
      label: "متوسط الإنجاز",
      value: `${summary.average_progress}%`,
      icon: CheckCircle2,
      tone: "text-success",
    },
    {
      label: "متأخرة",
      value: summary.overdue,
      icon: AlertTriangle,
      tone: "text-danger",
    },
    {
      label: "معطلة",
      value: summary.blocked,
      icon: AlertTriangle,
      tone: "text-danger",
    },
    {
      label: "حرجة",
      value: summary.critical,
      icon: Flag,
      tone: "text-warning",
    },
    {
      label: "خلال 7 أيام",
      value: summary.upcoming,
      icon: Clock,
      tone: "text-info",
    },
    {
      label: "بدون مالك",
      value: summary.unassigned,
      icon: UserRound,
      tone: "text-muted-foreground",
    },
  ];

  const attention = summary.items
    .filter(
      (item) =>
        item.is_overdue ||
        item.node.status === "blocked" ||
        item.is_critical ||
        item.waiting_on_dependencies ||
        item.is_upcoming,
    )
    .slice(0, 10);

  return (
    <section className="mb-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${tone}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">تحتاج انتباهك</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                العناصر المتأخرة أو الحرجة أو المعطلة أو المنتظرة على اعتماد.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {attention.length ? `${attention.length} معروضة` : "الوضع مستقر"}
            </span>
          </div>

          {!attention.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
              لا توجد عناصر تتطلب انتباهًا فوريًا.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {attention.map((item) => {
                const board = boardMap.get(item.board_id);
                if (!board) return null;
                return (
                  <Link
                    key={`${item.board_id}:${item.node.id}`}
                    to="/project/$projectId/board/$boardId"
                    params={{ projectId, boardId: item.board_id }}
                    search={{ node: item.node.id }}
                    className="flex flex-col gap-2 bg-background px-3 py-3 transition hover:bg-muted/50 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.node.title}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {board.name}
                        {item.node.owner ? ` · ${item.node.owner}` : " · بدون مالك"}
                        {item.node.due_date ? ` · ${formatLocalDate(item.node.due_date)}` : ""}
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
                          ينتظر {item.waiting_on.length}
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
            <Link2 className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold">صحة الاعتمادات</h2>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-success/10 p-3">
              <p className="text-2xl font-semibold text-success">{summary.dependency_ready}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                عناصر اكتملت كل متطلباتها ويمكن بدء العمل عليها.
              </p>
            </div>
            <div className="rounded-xl bg-warning/10 p-3">
              <p className="text-2xl font-semibold text-warning">
                {summary.waiting_on_dependencies}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                عناصر ما زالت تنتظر اكتمال متطلبات سابقة.
              </p>
            </div>
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>إجمالي العناصر التنفيذية</span>
                <strong className="text-foreground">{summary.total}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span>مكتملة</span>
                <strong className="text-foreground">{summary.completed}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span>قيد التنفيذ</span>
                <strong className="text-foreground">{summary.in_progress}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const boards = useBoards({ projectId });
  const access = useProjectAccess(projectId);
  const presence = useProjectPresence(projectId, "project", null, true);
  const [shareOpen, setShareOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CanvasNodeStatus>("all");
  const [priority, setPriority] = useState<"all" | CanvasPriority>("all");
  const [owner, setOwner] = useState("all");
  const [tag, setTag] = useState("all");

  const boardIds = useMemo(() => boards.data?.map((board) => board.id) ?? [], [boards.data]);
  const facetSearch = useCanvasNodeSearch(boardIds, {}, boardIds.length > 0);
  const owners = useMemo(
    () =>
      [...new Set((facetSearch.data ?? []).map((match) => match.node.owner).filter((value): value is string => !!value))]
        .sort((a, b) => a.localeCompare(b, "ar")),
    [facetSearch.data],
  );
  const tags = useMemo(
    () =>
      [...new Set((facetSearch.data ?? []).flatMap((match) => match.node.tags))]
        .sort((a, b) => a.localeCompare(b, "ar")),
    [facetSearch.data],
  );

  const filtersActive =
    !!query.trim() || status !== "all" || priority !== "all" || owner !== "all" || tag !== "all";
  const nodeSearch = useCanvasNodeSearch(
    boardIds,
    {
      query,
      status: status === "all" ? null : status,
      priority: priority === "all" ? null : priority,
      owner: owner === "all" ? null : owner,
      tag: tag === "all" ? null : tag,
    },
    filtersActive,
  );

  const boardMap = useMemo(
    () => new Map((boards.data ?? []).map((board) => [board.id, board] as const)),
    [boards.data],
  );
  const execution = useProjectExecutionSummary(boardIds);

  const visibleBoards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    if (!normalized) return boards.data ?? [];
    return (boards.data ?? []).filter((board) =>
      [board.name, board.description ?? ""]
        .join(" ")
        .toLocaleLowerCase("ar")
        .includes(normalized),
    );
  }, [boards.data, query]);

  if (project.isLoading) return <CardGridSkeleton />;
  if (!project.data) return <NotFoundState backTo="/projects" />;

  const p = project.data;
  const create = access.data?.can_edit ? (
    <CreateBoardDialog
      projectId={p.id}
      trigger={
        <Button>
          <Plus className="h-4 w-4" />
          لوحة جديدة
        </Button>
      }
    />
  ) : null;

  const matches = nodeSearch.data ?? [];

  return (
    <>
      <PageHeader
        leading={<Glyph icon={p.icon} color={p.color} size="lg" />}
        title={p.name}
        description={p.description ?? undefined}
        actions={
          <>
            <StatusBadge status={p.status} />
            {(presence.data?.length ?? 0) > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5"
                title="المتصلون الآن"
              >
                <div className="flex -space-x-1.5 space-x-reverse">
                  {(presence.data ?? []).slice(0, 4).map((person) => (
                    <span
                      key={person.user_id}
                      title={person.full_name}
                      className="relative grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-muted text-[8px] font-bold"
                    >
                      {person.full_name.trim().slice(0, 1) || "م"}
                      <span className="absolute -bottom-0.5 -end-0.5 h-2 w-2 rounded-full border border-card bg-success" />
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {presence.data?.length ?? 0} متصل
                </span>
              </div>
            )}
            {access.data?.role === "viewer" && (
              <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                عرض فقط
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              مشاركة
            </Button>
            {create}
          </>
        }
      />

      {execution.data && execution.data.total > 0 && (
        <ExecutionOverview
          summary={execution.data}
          boardMap={boardMap}
          projectId={projectId}
        />
      )}

      <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث في اللوحات والعناصر والوصف والمالك والوسوم…"
              className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-sm outline-none focus:border-brand"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | CanvasNodeStatus)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs"
              aria-label="تصفية حسب الحالة"
            >
              <option value="all">كل الحالات</option>
              {NODE_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as "all" | CanvasPriority)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs"
              aria-label="تصفية حسب الأولوية"
            >
              <option value="all">كل الأولويات</option>
              {PRIORITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs"
              aria-label="تصفية حسب المالك"
            >
              <option value="all">كل المالكين</option>
              {owners.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs"
              aria-label="تصفية حسب الوسم"
            >
              <option value="all">كل الوسوم</option>
              {tags.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setPriority("all");
                  setOwner("all");
                  setTag("all");
                }}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs text-danger hover:bg-danger/10"
              >
                <X className="h-3.5 w-3.5" /> مسح
              </button>
            )}
          </div>
        </div>

        {filtersActive && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">نتائج داخل اللوحات</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  البحث يشمل عنوان العنصر ووصفه ومالكه ووسومه في كل لوحات المشروع.
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {nodeSearch.isFetching ? "جارٍ البحث…" : `${matches.length} نتيجة`}
              </span>
            </div>

            {!nodeSearch.isFetching && matches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                لا توجد عناصر مطابقة داخل اللوحات.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {matches.slice(0, 60).map(({ board_id, node }) => {
                  const board = boardMap.get(board_id);
                  if (!board) return null;
                  return (
                    <Link
                      key={`${board_id}:${node.id}`}
                      to="/project/$projectId/board/$boardId"
                      params={{ projectId, boardId: board_id }}
                      search={{ node: node.id }}
                      className="rounded-xl border border-border bg-background p-3 transition hover:border-brand/40 hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">
                            {board.name} · {KIND_LABELS[node.kind]}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold">{node.title}</p>
                        </div>
                        {node.priority && (
                          <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
                            {PRIORITY_OPTIONS.find((item) => item.value === node.priority)?.label}
                          </span>
                        )}
                      </div>
                      {node.description && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {node.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                        {node.owner && <span>{node.owner}</span>}
                        {node.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                        <span>
                          {NODE_STATUS_OPTIONS.find((item) => item.value === node.status)?.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            {matches.length > 60 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                تم عرض أول 60 نتيجة. ضيّق البحث أو استخدم الفلاتر للوصول للعنصر المطلوب.
              </p>
            )}
          </div>
        )}
      </section>

      {boards.isLoading ? (
        <CardGridSkeleton tall />
      ) : !boards.data?.length ? (
        <EmptyState
          title="لا لوحات بعد"
          description="أنشئ أول لوحة عمل داخل هذا المشروع."
          action={create}
        />
      ) : query.trim() && !visibleBoards.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          لا توجد لوحة يطابق اسمها أو وصفها عبارة البحث. قد تجد العنصر المطلوب في النتائج أعلاه.
        </div>
      ) : (
        <BoardGrid boards={visibleBoards} />
      )}

      <ProjectShareDialog
        projectId={projectId}
        projectName={p.name}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}

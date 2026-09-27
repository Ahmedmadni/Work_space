import { createFileRoute, Link } from "@tanstack/react-router";
import { Filter, Plus, Search, X } from "lucide-react";
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
import { useProject } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { useCanvasNodeSearch } from "@/hooks/use-canvas";
import type { CanvasNodeStatus, CanvasPriority } from "@/types";

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

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const boards = useBoards({ projectId });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CanvasNodeStatus>("all");
  const [priority, setPriority] = useState<"all" | CanvasPriority>("all");

  const boardIds = useMemo(() => boards.data?.map((board) => board.id) ?? [], [boards.data]);
  const filtersActive = !!query.trim() || status !== "all" || priority !== "all";
  const nodeSearch = useCanvasNodeSearch(
    boardIds,
    {
      query,
      status: status === "all" ? null : status,
      priority: priority === "all" ? null : priority,
    },
    filtersActive,
  );

  const boardMap = useMemo(
    () => new Map((boards.data ?? []).map((board) => [board.id, board] as const)),
    [boards.data],
  );

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
  const create = (
    <CreateBoardDialog
      projectId={p.id}
      trigger={
        <Button>
          <Plus className="h-4 w-4" />
          لوحة جديدة
        </Button>
      }
    />
  );

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
            {create}
          </>
        }
      />

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
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setPriority("all");
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
    </>
  );
}

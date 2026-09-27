import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  FolderKanban,
  Flag,
  LayoutGrid,
  Link2,
  Plus,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  BoardCard,
  CardGridSkeleton,
  EmptyState,
  ProjectCard,
} from "@/components/app/shared";
import { CreateProjectDialog } from "@/components/app/dialogs";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { useProjectExecutionSummary } from "@/hooks/use-canvas";
import { CURRENT_USER } from "@/services/local-db";
import { arabicNumber, greeting, longDate } from "@/lib/format";
import type { BoardWithContext, Project, ProjectExecutionSummary } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الرئيسية — ProjectFlow" },
      {
        name: "description",
        content: "لوحة تحكم ProjectFlow: مشاريعك ولوحاتك ومؤشرات التنفيذ في مكان واحد.",
      },
    ],
  }),
  component: Dashboard,
});

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

function ExecutionCenter({
  summary,
  boards,
  projects,
}: {
  summary: ProjectExecutionSummary;
  boards: BoardWithContext[];
  projects: Project[];
}) {
  const boardMap = new Map(boards.map((board) => [board.id, board] as const));
  const projectMap = new Map(projects.map((project) => [project.id, project] as const));
  const attention = summary.items
    .filter(
      (item) =>
        item.is_overdue ||
        item.node.status === "blocked" ||
        item.is_critical ||
        item.waiting_on_dependencies ||
        item.is_upcoming,
    )
    .slice(0, 8);

  const metrics = [
    {
      label: "متأخر",
      value: summary.overdue,
      icon: AlertTriangle,
      className: "text-danger",
    },
    {
      label: "معطل",
      value: summary.blocked,
      icon: AlertTriangle,
      className: "text-danger",
    },
    {
      label: "حرج",
      value: summary.critical,
      icon: Flag,
      className: "text-warning",
    },
    {
      label: "خلال 7 أيام",
      value: summary.upcoming,
      icon: Clock,
      className: "text-info",
    },
    {
      label: "بدون مالك",
      value: summary.unassigned,
      icon: UserRound,
      className: "text-muted-foreground",
    },
    {
      label: "ينتظر اعتمادًا",
      value: summary.waiting_on_dependencies,
      icon: Link2,
      className: "text-warning",
    },
  ];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">مركز التنفيذ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة موحدة على ما يحتاج انتباهك عبر كل المشاريع واللوحات.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          متوسط الإنجاز <strong className="ms-1 text-foreground">{summary.average_progress}%</strong>
        </div>
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">الأولوية الآن</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                أعلى العناصر احتياجًا للمتابعة مرتبة حسب التأخير والأولوية والاستحقاق.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {attention.length ? `${arabicNumber(attention.length)} عناصر` : "لا توجد تنبيهات"}
            </span>
          </div>

          {!attention.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
              التنفيذ مستقر حاليًا ولا توجد عناصر ذات أولوية عاجلة.
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
                        {item.node.owner ? ` · ${item.node.owner}` : " · بدون مالك"}
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
          <h3 className="text-sm font-semibold">ملخص التنفيذ</h3>
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>الإنجاز العام</span>
                <span>{summary.average_progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${summary.average_progress}%` }}
                />
              </div>
            </div>
            <div className="border-t border-border pt-3 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">إجمالي العناصر</span>
                <strong>{arabicNumber(summary.total)}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">مكتملة</span>
                <strong>{arabicNumber(summary.completed)}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">قيد التنفيذ</span>
                <strong>{arabicNumber(summary.in_progress)}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">جاهزة بعد الاعتمادات</span>
                <strong className="text-success">{arabicNumber(summary.dependency_ready)}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Dashboard() {
  const projects = useProjects();
  const recentBoards = useBoards({ limit: 6, sort: "opened" });
  const allBoards = useBoards();
  const allBoardIds = useMemo(() => allBoards.data?.map((board) => board.id) ?? [], [allBoards.data]);
  const execution = useProjectExecutionSummary(allBoardIds);

  const stats = [
    { label: "المشاريع", value: projects.data?.length ?? 0 },
    {
      label: "مشاريع نشطة",
      value: projects.data?.filter((p) => p.status === "active").length ?? 0,
    },
    { label: "اللوحات", value: allBoards.data?.length ?? 0 },
  ];

  const createProject = (
    <CreateProjectDialog
      trigger={
        <Button>
          <Plus className="h-4 w-4" />
          مشروع جديد
        </Button>
      }
    />
  );

  return (
    <div className="space-y-10">
      <section className="canvas-grid relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-frost)] sm:p-8">
        <p className="text-sm text-muted-foreground">{longDate()}</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">
          {greeting()}، {CURRENT_USER.full_name.split(" ")[0]}
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          تابع التنفيذ عبر مشاريعك، ثم انتقل مباشرة إلى العنصر الذي يحتاج تدخلك.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {createProject}
          <Button variant="outline" asChild>
            <Link to="/templates">تصفّح القوالب</Link>
          </Button>
        </div>

        <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="frost rounded-2xl p-4">
              <p className="text-2xl font-bold text-foreground">{arabicNumber(s.value)}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {execution.data && execution.data.total > 0 && (
        <ExecutionCenter
          summary={execution.data}
          boards={allBoards.data ?? []}
          projects={projects.data ?? []}
        />
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">مشاريعي</h2>
        {projects.isLoading || allBoards.isLoading ? (
          <CardGridSkeleton />
        ) : projects.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data.slice(0, 6).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                boards={allBoards.data?.filter((board) => board.project_id === project.id).length}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="لا مشاريع بعد"
            description="أنشئ مشروعك الأول، ثم أضف لوحات العمل داخله مباشرة."
            action={createProject}
          />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">آخر اللوحات</h2>
        {recentBoards.isLoading ? (
          <CardGridSkeleton tall />
        ) : recentBoards.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentBoards.data.map((board) => <BoardCard key={board.id} board={board} />)}
          </div>
        ) : (
          <EmptyState
            icon={LayoutGrid}
            title="لا توجد لوحات بعد"
            description="افتح مشروعًا وأضف أول لوحة عمل."
          />
        )}
      </section>
    </div>
  );
}

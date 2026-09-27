import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, LayoutGrid, ListChecks, Plus } from "lucide-react";

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
import { CURRENT_USER } from "@/services/local-db";
import { arabicNumber, greeting, longDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الرئيسية — ProjectFlow" },
      {
        name: "description",
        content: "لوحة تحكم ProjectFlow: مشاريعك ولوحاتك الأخيرة في مكان واحد.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const projects = useProjects();
  const boards = useBoards({ limit: 6, sort: "opened" });
  const stats = [
    { label: "المشاريع", value: projects.data?.length ?? 0 },
    {
      label: "مشاريع نشطة",
      value: projects.data?.filter((p) => p.status === "active").length ?? 0,
    },
    { label: "اللوحات", value: boards.data?.length ?? 0 },
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
          افتح مشروعًا وابدأ العمل مباشرة على لوحاته.
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

      <section>
        <h2 className="mb-4 text-lg font-semibold">مشاريعي</h2>
        {projects.isLoading ? (
          <CardGridSkeleton />
        ) : projects.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data.slice(0, 6).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                boards={boards.data?.filter((b) => b.project_id === project.id).length}
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
        {boards.isLoading ? (
          <CardGridSkeleton tall />
        ) : boards.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {boards.data.map((board) => <BoardCard key={board.id} board={board} />)}
          </div>
        ) : (
          <EmptyState
            icon={LayoutGrid}
            title="لا توجد لوحات بعد"
            description="افتح مشروعًا وأضف أول لوحة عمل."
          />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">مهامي</h2>
        <EmptyState
          compact
          icon={ListChecks}
          title="لا مهام بعد"
          description="ستظهر مهامك هنا في مرحلة لاحقة."
        />
      </section>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, LayoutGrid, Plus } from "lucide-react";


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
import { arabicNumber, longDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الرئيسية — ProjectFlow" },
      { property: "og:title", content: "الرئيسية — ProjectFlow" },
      { property: "og:description", content: "مشاريعك الشخصية ولوحاتك ومهامك في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "ProjectFlow: مشاريعك الشخصية ولوحاتك ومهامك في مكان واحد.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const projects = useProjects();
  const recentBoards = useBoards({ limit: 6, sort: "opened" });
  const allBoards = useBoards();

  const stats = [
    { label: "المشاريع", value: projects.data?.length ?? 0 },
    {
      label: "مشاريع نشطة",
      value: projects.data?.filter((project) => project.status === "active").length ?? 0,
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
      <section className="border-b border-border pb-8">
        <p className="text-sm text-muted-foreground">{longDate()}</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">
          مشاريعي
        </h1>
        <div className="mt-6 flex flex-wrap gap-3">
          {createProject}
          <Button variant="outline" asChild>
            <Link to="/templates">تصفّح القوالب</Link>
          </Button>
        </div>

        <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="border-s border-border ps-4">
              <p className="text-2xl font-bold text-foreground">
                {arabicNumber(stat.value)}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

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
                boards={
                  allBoards.data?.filter((board) => board.project_id === project.id)
                    .length
                }
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
            {recentBoards.data.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, LayoutGrid, Plus } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  BoardCard,
  CardGridSkeleton,
  EmptyState,
  ProjectCard,
} from "@/components/app/shared";
import { CreateProjectDialog } from "@/components/app/dialogs";
import { PortfolioCommandCenter } from "@/components/portfolio/PortfolioCommandCenter";
import { PortfolioCapacityCenter } from "@/components/portfolio/PortfolioCapacityCenter";
import { PortfolioRiskRadar } from "@/components/portfolio/PortfolioRiskRadar";
import { StrategicAlignmentCenter } from "@/components/portfolio/StrategicAlignmentCenter";
import { ExecutiveStrategyReviewCenter } from "@/components/portfolio/ExecutiveStrategyReviewCenter";
import { StrategicForecastCenter } from "@/components/portfolio/StrategicForecastCenter";
import { StrategicScenarioLab } from "@/components/portfolio/StrategicScenarioLab";
import { StrategyRecoveryCenter } from "@/components/portfolio/StrategyRecoveryCenter";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { useProjectExecutionSummary } from "@/hooks/use-canvas";
import { usePortfolioPlanningData } from "@/hooks/use-planning";
import { usePortfolioActionCenter } from "@/hooks/use-action-center";
import {
  usePortfolioStrategy,
  useStrategyReviewData,
} from "@/hooks/use-strategy";
import { useCurrentUser } from "@/hooks/use-auth";
import { usePortfolioCollaborators } from "@/hooks/use-collaboration";
import { useStrategyRecoveryPlans } from "@/hooks/use-strategy-recovery";
import { arabicNumber, greeting, longDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الرئيسية — ProjectFlow" },
      {
        name: "description",
        content:
          "لوحة تحكم ProjectFlow: محفظة المشاريع والتنفيذ واللوحات في مكان واحد.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useCurrentUser();
  const projects = useProjects();
  const recentBoards = useBoards({ limit: 6, sort: "opened" });
  const allBoards = useBoards();
  const allBoardIds = useMemo(
    () => allBoards.data?.map((board) => board.id) ?? [],
    [allBoards.data],
  );
  const projectIds = useMemo(
    () => projects.data?.map((project) => project.id) ?? [],
    [projects.data],
  );
  const execution = useProjectExecutionSummary(allBoardIds);
  const portfolioPlanning = usePortfolioPlanningData(projectIds);
  const portfolioActions = usePortfolioActionCenter(projectIds);
  const portfolioStrategy = usePortfolioStrategy();
  const strategyReviews = useStrategyReviewData();
  const strategyRecovery = useStrategyRecoveryPlans();
  const portfolioCollaborators = usePortfolioCollaborators(projectIds);

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
      <section className="canvas-grid relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-frost)] sm:p-8">
        <p className="text-sm text-muted-foreground">{longDate()}</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">
          {greeting()}، {user?.full_name.split(" ")[0] ?? "مرحبًا"}
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          تابع محفظة مشاريعك من مستوى الإدارة، ثم انتقل مباشرة إلى المشروع أو العنصر
          الذي يحتاج تدخلًا.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {createProject}
          <Button variant="outline" asChild>
            <Link to="/templates">تصفّح القوالب</Link>
          </Button>
        </div>

        <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="frost rounded-2xl p-4">
              <p className="text-2xl font-bold text-foreground">
                {arabicNumber(stat.value)}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <StrategicAlignmentCenter
        data={portfolioStrategy.data}
        projects={projects.data ?? []}
        boards={allBoards.data ?? []}
        execution={execution.data}
        portfolioActions={portfolioActions.data}
        isLoading={
          projects.isLoading ||
          allBoards.isLoading ||
          portfolioStrategy.isLoading
        }
      />

      <ExecutiveStrategyReviewCenter
        strategy={portfolioStrategy.data}
        reviewData={strategyReviews.data}
        projects={projects.data ?? []}
        boards={allBoards.data ?? []}
        execution={execution.data}
        portfolioActions={portfolioActions.data}
        isLoading={
          portfolioStrategy.isLoading ||
          strategyReviews.isLoading ||
          projects.isLoading ||
          allBoards.isLoading
        }
      />

      <StrategicForecastCenter
        strategy={portfolioStrategy.data}
        reviewData={strategyReviews.data}
        isLoading={portfolioStrategy.isLoading || strategyReviews.isLoading}
      />

      <StrategicScenarioLab
        strategy={portfolioStrategy.data}
        reviewData={strategyReviews.data}
        isLoading={portfolioStrategy.isLoading || strategyReviews.isLoading}
      />

      <StrategyRecoveryCenter
        strategy={portfolioStrategy.data}
        reviewData={strategyReviews.data}
        recoveryData={strategyRecovery.data}
        collaboratorsByProject={portfolioCollaborators.data ?? {}}
        isLoading={
          portfolioStrategy.isLoading ||
          strategyReviews.isLoading ||
          strategyRecovery.isLoading ||
          portfolioCollaborators.isLoading
        }
      />

      {execution.data && (
        <PortfolioCommandCenter
          summary={execution.data}
          boards={allBoards.data ?? []}
          projects={projects.data ?? []}
        />
      )}

      <PortfolioRiskRadar
        data={portfolioActions.data}
        projects={projects.data ?? []}
        isLoading={projects.isLoading || portfolioActions.isLoading}
      />

      {execution.data && (
        <PortfolioCapacityCenter
          summary={execution.data}
          boards={allBoards.data ?? []}
          projects={projects.data ?? []}
          planningByProject={portfolioPlanning.data ?? {}}
          isLoading={portfolioPlanning.isLoading}
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

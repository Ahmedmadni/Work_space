import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

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

export const Route = createFileRoute("/project/$projectId/")({
  head: () => ({
    meta: [
      { title: "المشروع — ProjectFlow" },
      { name: "description", content: "لوحات العمل الخاصة بالمشروع." },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const boards = useBoards({ projectId });

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
      {boards.isLoading ? (
        <CardGridSkeleton tall />
      ) : !boards.data?.length ? (
        <EmptyState
          title="لا لوحات بعد"
          description="أنشئ أول لوحة عمل داخل هذا المشروع."
          action={create}
        />
      ) : (
        <BoardGrid boards={boards.data} />
      )}
    </>
  );
}

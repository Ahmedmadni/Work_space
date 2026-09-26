import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BoardGrid, CardGridSkeleton, EmptyState, Glyph, NotFoundState, PageHeader, StatusBadge } from "@/components/app/shared";
import { CreateBoardDialog } from "@/components/app/dialogs";
import { useProject } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";

export const Route = createFileRoute("/workspace/$workspaceId/project/$projectId/")({
  head: () => ({
    meta: [
      { title: "المشروع — ProjectFlow" },
      { name: "description", content: "لوحات التخطيط الخاصة بالمشروع." },
      { property: "og:title", content: "المشروع — ProjectFlow" },
      { property: "og:description", content: "لوحات التخطيط الخاصة بالمشروع." },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId, workspaceId } = Route.useParams();
  const project = useProject(projectId);
  const boards = useBoards({ projectId });
  if (project.isLoading) return <CardGridSkeleton />;
  if (!project.data || project.data.workspace_id !== workspaceId) return <NotFoundState backTo="/workspaces" />;
  const p = project.data;
  const create = <CreateBoardDialog workspaceId={p.workspace_id} projectId={p.id} trigger={<Button><Plus className="h-4 w-4" />لوحة جديدة</Button>} />;
  return (
    <>
      <Link to="/workspace/$workspaceId" params={{ workspaceId }} className="mb-4 inline-block text-sm text-muted-foreground hover:text-brand">→ العودة لمساحة العمل</Link>
      <PageHeader leading={<Glyph icon={p.icon} color={p.color} size="lg" />} title={p.name} description={p.description ?? undefined} actions={<><StatusBadge status={p.status} />{create}</>} />
      {boards.isLoading ? <CardGridSkeleton tall /> : !boards.data?.length ? (
        <EmptyState title="لا لوحات بعد" description="أنشئ أول لوحة تخطيط لهذا المشروع." action={create} />
      ) : <BoardGrid boards={boards.data} />}
    </>
  );
}

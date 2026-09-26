import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardGridSkeleton, EmptyState, Glyph, PageHeader, ProjectCard } from "@/components/app/shared";
import { CreateProjectDialog } from "@/components/app/dialogs";
import { useArchiveWorkspace, useWorkspace } from "@/hooks/use-workspaces";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  head: () => ({
    meta: [
      { title: "مساحة العمل — ProjectFlow" },
      { name: "description", content: "مشاريع ولوحات مساحة العمل." },
      { property: "og:title", content: "مساحة العمل — ProjectFlow" },
      { property: "og:description", content: "مشاريع ولوحات مساحة العمل." },
    ],
  }),
  component: WorkspaceDetail,
});

function WorkspaceDetail() {
  const { workspaceId } = Route.useParams();
  const nav = useNavigate();
  const ws = useWorkspace(workspaceId);
  const projects = useProjects(workspaceId);
  const boards = useBoards({ workspaceId });
  const archive = useArchiveWorkspace();
  if (ws.isLoading) return <CardGridSkeleton />;
  if (!ws.data) return <EmptyState title="المساحة غير موجودة" description="ربما حُذفت أو أُرشفت." />;
  const w = ws.data;
  const create = <CreateProjectDialog workspaceId={w.id} trigger={<Button><Plus className="h-4 w-4" />مشروع جديد</Button>} />;
  return (
    <>
      <div className="mb-4"><Glyph icon={w.icon} color={w.color} size="lg" /></div>
      <PageHeader eyebrow="مساحة عمل" title={w.name} description={w.description ?? undefined}
        actions={<>
          <Button variant="outline" onClick={() => archive.mutate(w.id, { onSuccess: () => nav({ to: "/workspaces" }) })}><Archive className="h-4 w-4" />أرشفة</Button>
          {create}
        </>} />
      {projects.isLoading ? <CardGridSkeleton /> : !projects.data?.length ? (
        <EmptyState title="لا مشاريع هنا بعد" description="أضف أول مشروع لهذه المساحة." action={create} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((p) => (
            <ProjectCard key={p.id} project={p} boards={boards.data?.filter((b) => b.project_id === p.id).length} />
          ))}
        </div>
      )}
    </>
  );
}

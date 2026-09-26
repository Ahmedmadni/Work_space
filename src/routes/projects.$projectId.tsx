import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ChevronLeft, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BoardCard, CardGridSkeleton, EmptyState, Glyph, PageHeader, StatusBadge } from "@/components/app/shared";
import { CreateBoardDialog } from "@/components/app/dialogs";
import { useArchiveProject, useProject, useUpdateProject } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { PROJECT_STATUS_LABELS } from "@/lib/labels";
import type { ProjectStatus } from "@/types";

export const Route = createFileRoute("/projects/$projectId")({
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
  const { projectId } = Route.useParams();
  const nav = useNavigate();
  const project = useProject(projectId);
  const boards = useBoards({ projectId });
  const update = useUpdateProject();
  const archive = useArchiveProject();
  if (project.isLoading) return <CardGridSkeleton />;
  if (!project.data) return <EmptyState title="المشروع غير موجود" description="ربما حُذف أو أُرشف." />;
  const p = project.data;
  const create = <CreateBoardDialog workspaceId={p.workspace_id} projectId={p.id} trigger={<Button><Plus className="h-4 w-4" />لوحة جديدة</Button>} />;
  return (
    <>
      <Link to="/workspaces/$workspaceId" params={{ workspaceId: p.workspace_id }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand">
        العودة لمساحة العمل <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="mb-4 flex items-center gap-3"><Glyph icon={p.icon} color={p.color} size="lg" /><StatusBadge status={p.status} /></div>
      <PageHeader eyebrow="مشروع" title={p.name} description={p.description ?? undefined}
        actions={<>
          <select value={p.status} onChange={(e) => update.mutate({ id: p.id, status: e.target.value as ProjectStatus })}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm">
            {(["planning", "active", "on_hold", "completed"] as ProjectStatus[]).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
          </select>
          <Button variant="outline" onClick={() => archive.mutate(p.id, { onSuccess: () => nav({ to: "/workspaces/$workspaceId", params: { workspaceId: p.workspace_id } }) })}><Archive className="h-4 w-4" />أرشفة</Button>
          {create}
        </>} />
      {boards.isLoading ? <CardGridSkeleton /> : !boards.data?.length ? (
        <EmptyState title="لا لوحات بعد" description="أنشئ أول لوحة تخطيط لهذا المشروع." action={create} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{boards.data.map((b) => <BoardCard key={b.id} board={b} />)}</div>
      )}
    </>
  );
}

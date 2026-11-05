import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BoardGrid, CardGridSkeleton, EmptyState, Glyph, NotFoundState, PageHeader, StatusBadge } from "@/components/app/shared";
import { CreateBoardDialog } from "@/components/app/dialogs";
import { useProject } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { useProjectAccess } from "@/hooks/use-collaboration";

export const Route = createFileRoute("/project/$projectId/")({
  head: () => ({ meta: [
    { title: "مشروعي — ProjectFlow" },
    { name: "description", content: "لوحات مشروعي الشخصي ومهامه." },
    { property: "og:title", content: "مشروعي — ProjectFlow" },
    { property: "og:description", content: "لوحات مشروعي الشخصي ومهامه." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const boards = useBoards({ projectId });
  const access = useProjectAccess(projectId);
  const [query, setQuery] = useState("");
  if (project.isLoading) return <CardGridSkeleton />;
  if (!project.data) return <NotFoundState backTo="/projects" />;
  const p = project.data;
  const create = access.data?.can_edit ? <CreateBoardDialog projectId={p.id} trigger={<Button><Plus /> لوحة جديدة</Button>} /> : null;
  const visible = (boards.data ?? []).filter((board) => [board.name, board.description ?? ""].join(" ").toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")));
  return <>
    <PageHeader leading={<Glyph icon={p.icon} color={p.color} size="lg" />} title={p.name} description={p.description ?? undefined} actions={<><StatusBadge status={p.status} />{create}</>} />
    <div className="relative mb-6 max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input aria-label="البحث في اللوحات" placeholder="ابحث عن لوحة…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background pe-3 ps-9 text-sm" />
    </div>
    {boards.isLoading ? <CardGridSkeleton tall /> : !boards.data?.length ? <EmptyState title="لا لوحات بعد" description="أضف أول لوحة لمشروعك." action={create} /> : !visible.length ? <p className="py-12 text-center text-muted-foreground">لا توجد لوحة مطابقة.</p> : <BoardGrid boards={visible} />}
  </>;
}

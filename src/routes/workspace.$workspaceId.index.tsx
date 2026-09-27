import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban, Plus, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { BoardGrid, CardGridSkeleton, EmptyState, Glyph, NoResults, NotFoundState, PageHeader, ProjectCard, SectionTitle } from "@/components/app/shared";
import { CreateProjectDialog } from "@/components/app/dialogs";
import { useWorkspace } from "@/hooks/use-workspaces";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { arabicNumber } from "@/lib/format";

export const Route = createFileRoute("/workspace/$workspaceId/")({
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
  const ws = useWorkspace(workspaceId);
  const projects = useProjects(workspaceId);
  const boards = useBoards({ workspaceId });
  const [q, setQ] = useState("");
  if (ws.isLoading) return <CardGridSkeleton />;
  if (!ws.data) return <NotFoundState backTo="/workspaces" />;
  const w = ws.data;
  const term = q.trim().toLowerCase();
  const rows = (projects.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term));
  const create = <CreateProjectDialog workspaceId={w.id} trigger={<Button><Plus className="h-4 w-4" />مشروع جديد</Button>} />;
  return (
    <div className="space-y-10">
      <PageHeader leading={<Glyph icon={w.icon} color={w.color} size="lg" />} eyebrow={`${arabicNumber(w.projects_count)} مشاريع · ${arabicNumber(w.boards_count)} لوحات`} title={w.name} description={w.description ?? undefined} actions={create} />
      <section>
        <SectionTitle>المشاريع</SectionTitle>
        {!!projects.data?.length && (
          <div className="relative mb-4 max-w-xs">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في مشاريع المساحة…" className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-brand" />
          </div>
        )}
        {projects.isLoading ? <CardGridSkeleton /> : !projects.data?.length ? (
          <EmptyState icon={FolderKanban} title="لا مشاريع هنا بعد" description="أضف أول مشروع لهذه المساحة." action={create} />
        ) : !rows.length ? <NoResults query={q} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => <ProjectCard key={p.id} project={p} boards={boards.data?.filter((b) => b.project_id === p.id).length} />)}
          </div>
        )}
      </section>
      <section>
        <SectionTitle>آخر اللوحات</SectionTitle>
        {boards.data?.length ? <BoardGrid boards={boards.data.slice(0, 6)} /> : <EmptyState compact title="لا توجد لوحات" description="افتح مشروعًا وأنشئ أول لوحة." />}
      </section>
    </div>
  );
}

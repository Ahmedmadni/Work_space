import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban, Search } from "lucide-react";
import { useState } from "react";

import { CardGridSkeleton, EmptyState, NoResults, PageHeader, ProjectCard } from "@/components/app/shared";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "المشاريع — ProjectFlow" },
      { name: "description", content: "كل مشاريعك عبر جميع مساحات العمل." },
      { property: "og:title", content: "المشاريع — ProjectFlow" },
      { property: "og:description", content: "كل مشاريعك عبر جميع مساحات العمل." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const boards = useBoards();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term));
  return (
    <>
      <PageHeader title="المشاريع" description="كل مشاريعك عبر جميع مساحات العمل." />
      <div className="relative mb-6 max-w-xs">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في المشاريع…" className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-brand" />
      </div>
      {isLoading ? <CardGridSkeleton /> : !data?.length ? <EmptyState icon={FolderKanban} title="لا مشاريع بعد" description="افتح مساحة عمل وأنشئ أول مشروع." /> : !rows.length ? <NoResults query={q} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((p) => <ProjectCard key={p.id} project={p} boards={boards.data?.filter((b) => b.project_id === p.id).length} />)}</div>
      )}
    </>
  );
}

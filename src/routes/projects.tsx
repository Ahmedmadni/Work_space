import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban, Plus, Search } from "lucide-react";
import { useState } from "react";

import {
  CardGridSkeleton,
  EmptyState,
  NoResults,
  PageHeader,
  ProjectCard,
} from "@/components/app/shared";
import { CreateProjectDialog } from "@/components/app/dialogs";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "المشاريع — ProjectFlow" },
      { name: "description", content: "كل مشاريعك ولوحات العمل التابعة لها." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const boards = useBoards();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (p) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.description ?? "").toLowerCase().includes(term),
  );

  const create = (
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
    <>
      <PageHeader
        title="المشاريع"
        description="كل مشروع يحتوي لوحات العمل الخاصة به مباشرة."
        actions={create}
      />

      <div className="relative mb-6 max-w-xs">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث في المشاريع…"
          className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-brand"
        />
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : !data?.length ? (
        <EmptyState
          icon={FolderKanban}
          title="لا مشاريع بعد"
          description="أنشئ مشروعك الأول، ثم أضف لوحات العمل داخله."
          action={create}
        />
      ) : !rows.length ? (
        <NoResults query={q} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              boards={boards.data?.filter((b) => b.project_id === p.id).length}
            />
          ))}
        </div>
      )}
    </>
  );
}

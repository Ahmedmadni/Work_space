import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardGridSkeleton, EmptyState, ErrorState, NoResults, PageHeader, WorkspaceCard } from "@/components/app/shared";
import { CreateWorkspaceDialog } from "@/components/app/dialogs";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspaces/")({
  head: () => ({
    meta: [
      { title: "مساحات العمل — ProjectFlow" },
      { name: "description", content: "جميع مساحات العمل التي تنتمي إليها." },
      { property: "og:title", content: "مساحات العمل — ProjectFlow" },
      { property: "og:description", content: "جميع مساحات العمل التي تنتمي إليها." },
    ],
  }),
  component: WorkspacesPage,
});

type Sort = "updated" | "name" | "newest";

function WorkspacesPage() {
  const { data, isLoading, isError, refetch } = useWorkspaces();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data ?? []).filter((w) => !term || w.name.toLowerCase().includes(term) || (w.description ?? "").toLowerCase().includes(term));
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "ar") : sort === "newest" ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at),
    );
  }, [data, q, sort]);
  const create = <CreateWorkspaceDialog trigger={<Button><Plus className="h-4 w-4" />مساحة جديدة</Button>} />;
  return (
    <>
      <PageHeader title="مساحات العمل" description="كل مساحة تجمع مشاريع فريق أو قسم." actions={create} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في المساحات…" className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-brand" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="الترتيب" className="h-10 rounded-xl border border-border bg-card px-3 text-sm">
          <option value="updated">آخر تحديث</option><option value="name">الاسم</option><option value="newest">الأحدث إنشاءً</option>
        </select>
        <div className="flex rounded-xl border border-border bg-card p-1">
          {(["grid", "list"] as const).map((v) => (
            <button key={v} aria-label={v === "grid" ? "شبكة" : "قائمة"} onClick={() => setView(v)} className={cn("grid h-8 w-8 place-items-center rounded-lg", view === v ? "bg-brand/12 text-brand" : "text-muted-foreground")}>
              {v === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <CardGridSkeleton /> : isError ? <ErrorState onRetry={() => void refetch()} /> : !data?.length ? (
        <EmptyState title="لا توجد مساحات" description="ابدأ بإنشاء أول مساحة عمل." action={create} />
      ) : !rows.length ? <NoResults query={q} /> : (
        <div className={view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {rows.map((w) => <WorkspaceCard key={w.id} workspace={w} view={view} />)}
        </div>
      )}
    </>
  );
}

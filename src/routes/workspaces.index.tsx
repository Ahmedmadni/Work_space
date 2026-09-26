import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardGridSkeleton, EmptyState, Glyph, PageHeader } from "@/components/app/shared";
import { CreateWorkspaceDialog } from "@/components/app/dialogs";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { relativeTime } from "@/lib/format";

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

function WorkspacesPage() {
  const { data, isLoading } = useWorkspaces();
  const create = <CreateWorkspaceDialog trigger={<Button><Plus className="h-4 w-4" />مساحة جديدة</Button>} />;
  return (
    <>
      <PageHeader title="مساحات العمل" description="كل مساحة تجمع مشاريع فريق أو قسم." actions={create} />
      {isLoading ? <CardGridSkeleton /> : !data?.length ? (
        <EmptyState title="لا توجد مساحات" description="ابدأ بإنشاء أول مساحة عمل." action={create} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((w) => (
            <Link key={w.id} to="/workspace/$workspaceId" params={{ workspaceId: w.id }}
              className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <Glyph icon={w.icon} color={w.color} size="lg" />
              <h3 className="mt-4 text-lg font-semibold">{w.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.description ?? "بلا وصف"}</p>
              <p className="mt-4 text-xs text-muted-foreground">{w.projects_count} مشاريع · {w.boards_count} لوحات · {relativeTime(w.updated_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

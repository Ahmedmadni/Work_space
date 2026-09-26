import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BoardCard, CardGridSkeleton, EmptyState, Glyph, ProjectCard } from "@/components/app/shared";
import { CreateWorkspaceDialog } from "@/components/app/dialogs";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useProjects } from "@/hooks/use-projects";
import { useBoards } from "@/hooks/use-boards";
import { CURRENT_USER } from "@/services/local-db";
import { arabicNumber, greeting, longDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الرئيسية — ProjectFlow" },
      { name: "description", content: "لوحة تحكم ProjectFlow: مساحاتك ومشاريعك ولوحاتك الأخيرة في مكان واحد." },
      { property: "og:title", content: "الرئيسية — ProjectFlow" },
      { property: "og:description", content: "مساحاتك ومشاريعك ولوحاتك الأخيرة في مكان واحد." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const ws = useWorkspaces();
  const projects = useProjects();
  const boards = useBoards({ limit: 6 });
  const stats = [
    { label: "مساحات العمل", value: ws.data?.length ?? 0 },
    { label: "المشاريع", value: projects.data?.length ?? 0 },
    { label: "اللوحات", value: ws.data?.reduce((a, w) => a + w.boards_count, 0) ?? 0 },
  ];
  return (
    <div className="space-y-10">
      <section className="canvas-grid relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-frost)]">
        <p className="text-sm text-muted-foreground">{longDate()}</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">{greeting()}، {CURRENT_USER.full_name.split(" ")[0]}</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">خطّط أفكارك على لوحات واضحة، ونظّم مشاريع فريقك في مساحات مستقلة.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <CreateWorkspaceDialog trigger={<Button><Plus className="h-4 w-4" />مساحة جديدة</Button>} />
          <Button variant="outline" asChild><Link to="/templates">تصفّح القوالب</Link></Button>
        </div>
        <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="frost rounded-2xl p-4">
              <p className="text-2xl font-bold text-foreground">{arabicNumber(s.value)}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">آخر اللوحات</h2>
        {boards.isLoading ? <CardGridSkeleton /> : boards.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{boards.data.map((b) => <BoardCard key={b.id} board={b} />)}</div>
        ) : <EmptyState title="لا توجد لوحات بعد" description="أنشئ مشروعًا ثم أضف أول لوحة تخطيط." />}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">المشاريع النشطة</h2>
        {projects.isLoading ? <CardGridSkeleton /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data?.slice(0, 6).map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">مساحات العمل</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ws.data?.map((w) => (
            <Link key={w.id} to="/workspaces/$workspaceId" params={{ workspaceId: w.id }} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-brand">
              <Glyph icon={w.icon} color={w.color} />
              <div><p className="font-medium">{w.name}</p><p className="text-xs text-muted-foreground">{w.projects_count} مشاريع · {w.boards_count} لوحات</p></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

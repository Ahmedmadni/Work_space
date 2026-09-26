import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/app/shared";
import { useArchivedWorkspaces, useRestoreWorkspace, useDeleteWorkspace } from "@/hooks/use-workspaces";
import { useArchivedProjects, useRestoreProject, useDeleteProject } from "@/hooks/use-projects";
import { useArchivedBoards, useRestoreBoard, useDeleteBoard } from "@/hooks/use-boards";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "الأرشيف — ProjectFlow" },
      { name: "description", content: "استعد أو احذف المساحات والمشاريع واللوحات المؤرشفة." },
      { property: "og:title", content: "الأرشيف — ProjectFlow" },
      { property: "og:description", content: "العناصر المؤرشفة في ProjectFlow." },
    ],
  }),
  component: ArchivePage,
});

function Row({ name, kind, onRestore, onDelete }: { name: string; kind: string; onRestore: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{kind}</p></div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onRestore}>استعادة</Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => { if (confirm("حذف نهائي؟ لا يمكن التراجع.")) onDelete(); }}>حذف</Button>
      </div>
    </div>
  );
}

function ArchivePage() {
  const ws = useArchivedWorkspaces(), pr = useArchivedProjects(), bd = useArchivedBoards();
  const rw = useRestoreWorkspace(), dw = useDeleteWorkspace();
  const rp = useRestoreProject(), dp = useDeleteProject();
  const rb = useRestoreBoard(), db = useDeleteBoard();
  const rows: ReactNode[] = [
    ...(ws.data ?? []).map((w) => <Row key={w.id} name={w.name} kind="مساحة عمل" onRestore={() => rw.mutate(w.id)} onDelete={() => dw.mutate(w.id)} />),
    ...(pr.data ?? []).map((p) => <Row key={p.id} name={p.name} kind="مشروع" onRestore={() => rp.mutate(p.id)} onDelete={() => dp.mutate(p.id)} />),
    ...(bd.data ?? []).map((b) => <Row key={b.id} name={b.name} kind={`لوحة · ${b.project_name}`} onRestore={() => rb.mutate(b.id)} onDelete={() => db.mutate(b.id)} />),
  ];
  return (
    <>
      <PageHeader title="الأرشيف" description="العناصر المؤرشفة لا تظهر في القوائم ويمكن استعادتها في أي وقت." />
      {rows.length ? <div className="space-y-2">{rows}</div> : <EmptyState title="الأرشيف فارغ" description="كل شيء نشط حاليًا." />}
    </>
  );
}

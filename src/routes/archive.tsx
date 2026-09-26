import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/app/shared";
import { ConfirmDialog } from "@/components/app/dialogs";
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

function Row({ name, kind, detail, deleteNote, onRestore, onDelete }: { name: string; kind: string; detail?: string; deleteNote: string; onRestore: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{kind}</span><p className="truncate font-medium">{name}</p></div>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onRestore}>استعادة</Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>حذف نهائي</Button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`حذف «${name}» نهائيًا؟`} description={deleteNote} onConfirm={onDelete} />
    </div>
  );
}

function ArchivePage() {
  const ws = useArchivedWorkspaces(), pr = useArchivedProjects(), bd = useArchivedBoards();
  const rw = useRestoreWorkspace(), dw = useDeleteWorkspace();
  const rp = useRestoreProject(), dp = useDeleteProject();
  const rb = useRestoreBoard(), db = useDeleteBoard();
  const rows: ReactNode[] = [
    ...(ws.data ?? []).map((w) => <Row key={w.id} name={w.name} kind="مساحة عمل" detail={`تحتوي ${w.projects_count} مشروع و${w.boards_count} لوحة — تعود معها عند الاستعادة`} deleteNote="سيتم حذف المشاريع واللوحات التابعة لهذه المساحة نهائيًا. لا يمكن التراجع." onRestore={() => rw.mutate(w.id)} onDelete={() => dw.mutate(w.id)} />),
    ...(pr.data ?? []).map((p) => <Row key={p.id} name={p.name} kind="مشروع" detail="لوحاته تعود معه عند الاستعادة" deleteNote="سيتم حذف المشروع وجميع لوحاته نهائيًا. لا يمكن التراجع." onRestore={() => rp.mutate(p.id)} onDelete={() => dp.mutate(p.id)} />),
    ...(bd.data ?? []).map((b) => <Row key={b.id} name={b.name} kind="لوحة" detail={`${b.workspace_name} / ${b.project_name}`} deleteNote="ستُحذف اللوحة نهائيًا ولا يمكن استعادتها." onRestore={() => rb.mutate(b.id)} onDelete={() => db.mutate(b.id)} />),
  ];
  return (
    <>
      <PageHeader title="الأرشيف" description="العناصر المؤرشفة لا تظهر في القوائم ويمكن استعادتها في أي وقت." />
      {rows.length ? <div className="space-y-2">{rows}</div> : <EmptyState title="الأرشيف فارغ" description="كل شيء نشط حاليًا." />}
    </>
  );
}

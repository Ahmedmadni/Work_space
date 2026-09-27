import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/app/shared";
import { ConfirmDialog } from "@/components/app/dialogs";
import {
  useArchivedProjects,
  useRestoreProject,
  useDeleteProject,
} from "@/hooks/use-projects";
import {
  useArchivedBoards,
  useRestoreBoard,
  useDeleteBoard,
} from "@/hooks/use-boards";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "الأرشيف — ProjectFlow" },
      {
        name: "description",
        content: "استعد أو احذف المشاريع واللوحات المؤرشفة.",
      },
    ],
  }),
  component: ArchivePage,
});

function Row({
  name,
  kind,
  detail,
  deleteNote,
  onRestore,
  onDelete,
}: {
  name: string;
  kind: string;
  detail?: string;
  deleteNote: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {kind}
          </span>
          <p className="truncate font-medium">{name}</p>
        </div>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onRestore}>
          استعادة
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          onClick={() => setConfirm(true)}
        >
          حذف نهائي
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`حذف «${name}» نهائيًا؟`}
        description={deleteNote}
        onConfirm={onDelete}
      />
    </div>
  );
}

function ArchivePage() {
  const projects = useArchivedProjects();
  const boards = useArchivedBoards();

  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();
  const restoreBoard = useRestoreBoard();
  const deleteBoard = useDeleteBoard();

  const rows: ReactNode[] = [
    ...(projects.data ?? []).map((project) => (
      <Row
        key={project.id}
        name={project.name}
        kind="مشروع"
        detail="تعود لوحاته معه عند الاستعادة"
        deleteNote="سيتم حذف المشروع وجميع لوحاته نهائيًا. لا يمكن التراجع."
        onRestore={() => restoreProject.mutate(project.id)}
        onDelete={() => deleteProject.mutate(project.id)}
      />
    )),
    ...(boards.data ?? []).map((board) => (
      <Row
        key={board.id}
        name={board.name}
        kind="لوحة"
        detail={board.project_name}
        deleteNote="ستُحذف اللوحة نهائيًا ولا يمكن استعادتها."
        onRestore={() => restoreBoard.mutate(board.id)}
        onDelete={() => deleteBoard.mutate(board.id)}
      />
    )),
  ];

  return (
    <>
      <PageHeader
        title="الأرشيف"
        description="المشاريع واللوحات المؤرشفة لا تظهر في القوائم ويمكن استعادتها."
      />
      {rows.length ? (
        <div className="space-y-2">{rows}</div>
      ) : (
        <EmptyState title="الأرشيف فارغ" description="كل المشاريع واللوحات نشطة حاليًا." />
      )}
    </>
  );
}

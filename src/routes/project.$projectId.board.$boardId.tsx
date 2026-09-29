import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProjectWorkbench } from "@/components/workbench/ProjectWorkbench";
import { ProjectShareDialog } from "@/components/collaboration/ProjectShareDialog";
import { ProjectCollaborationDock } from "@/components/collaboration/ProjectCollaborationDock";
import { NotificationCenterButton } from "@/components/notifications/NotificationCenterButton";
import { useBoard, useMarkBoardOpened } from "@/hooks/use-boards";
import { useProject } from "@/hooks/use-projects";
import { useProjectAccess } from "@/hooks/use-collaboration";
import { BOARD_TYPE_LABELS } from "@/lib/labels";
import { NotFoundState } from "@/components/app/shared";

export const Route = createFileRoute("/project/$projectId/board/$boardId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { node?: string; doc?: string; page?: number; comment?: string } => {
    const rawPage =
      typeof search.page === "number"
        ? search.page
        : typeof search.page === "string"
          ? Number(search.page)
          : NaN;
    return {
      node: typeof search.node === "string" ? search.node : undefined,
      doc: typeof search.doc === "string" ? search.doc : undefined,
      page:
        Number.isInteger(rawPage) && rawPage > 0
          ? rawPage
          : undefined,
      comment:
        typeof search.comment === "string"
          ? search.comment
          : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "اللوحة — ProjectFlow" },
      { name: "description", content: "مساحة التخطيط البصري للوحة." },
    ],
  }),
  component: BoardPage,
});

function BoardPage() {
  const { boardId, projectId } = Route.useParams();
  const { node, doc, page, comment } = Route.useSearch();
  const { data: board, isLoading } = useBoard(boardId);
  const project = useProject(projectId);
  const markOpened = useMarkBoardOpened();
  const access = useProjectAccess(projectId);
  const [shareOpen, setShareOpen] = useState(false);
  const [liveContext, setLiveContext] = useState<{
    type: "board" | "document";
    id: string;
    pageNumber?: number;
  }>({ type: "board", id: boardId });
  const marked = useRef<string | null>(null);

  const valid = !!board && board.project_id === projectId && !!project.data;

  useEffect(() => {
    if (valid && marked.current !== boardId) {
      marked.current = boardId;
      markOpened.mutate(boardId);
    }
  }, [valid, boardId, markOpened]);

  if ((!isLoading && !valid) || (!project.isLoading && !project.data)) {
    return <div className="p-8"><NotFoundState backTo="/projects" /></div>;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="frost hairline-b z-40 flex h-14 items-center gap-2 px-3">
        <Link
          to="/project/$projectId"
          params={{ projectId }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-muted"
          aria-label="رجوع"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>

        <div className="min-w-0">
          <p className="truncate font-semibold">{board?.name ?? "…"}</p>
          {board && (
            <nav
              aria-label="مسار التنقل"
              className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"
            >
              <Link to="/" className="hover:text-foreground">الرئيسية</Link>
              <span>/</span>
              <Link
                to="/project/$projectId"
                params={{ projectId }}
                className="truncate hover:text-foreground"
              >
                {project.data?.name ?? board.project_name}
              </Link>
              <span className="hidden sm:inline">· {BOARD_TYPE_LABELS[board.board_type]}</span>
            </nav>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2">
          <NotificationCenterButton />
          <ProjectCollaborationDock
            projectId={projectId}
            boardId={boardId}
            presenceContextType={liveContext.type}
            presenceContextId={liveContext.id}
            documentPageNumber={liveContext.pageNumber}
            focusCommentId={node ? undefined : comment}
          />
          {access.data?.role === "viewer" && (
            <span className="hidden rounded-lg bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline">
              عرض فقط
            </span>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            title="مشاركة المشروع وإدارة الأعضاء"
            aria-label="مشاركة المشروع"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {board && (
        <ProjectWorkbench
          projectId={projectId}
          boardId={boardId}
          boardName={board.name}
          initialFocusNodeId={node}
          initialFocusCommentId={comment}
          initialDocumentId={doc}
          initialDocumentPage={page}
          canEdit={access.data?.can_edit ?? false}
          onContextChange={setLiveContext}
        />
      )}

      <ProjectShareDialog
        projectId={projectId}
        projectName={project.data?.name ?? board?.project_name ?? "المشروع"}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}

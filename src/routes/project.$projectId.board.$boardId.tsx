import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Share2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { BoardCanvas } from "@/components/canvas/BoardCanvas";
import { useBoard, useMarkBoardOpened } from "@/hooks/use-boards";
import { useProject } from "@/hooks/use-projects";
import { BOARD_TYPE_LABELS } from "@/lib/labels";
import { NotFoundState } from "@/components/app/shared";

export const Route = createFileRoute("/project/$projectId/board/$boardId")({
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
  const { data: board, isLoading } = useBoard(boardId);
  const project = useProject(projectId);
  const markOpened = useMarkBoardOpened();
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

        <div className="ms-auto flex items-center">
          <button
            disabled
            title="مشاركة (قريبًا)"
            aria-label="مشاركة"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground opacity-40"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <BoardCanvas boardId={boardId} />
    </div>
  );
}

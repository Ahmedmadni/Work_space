import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { BoardCanvas } from "@/components/canvas/BoardCanvas";
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
      { property: "og:title", content: "اللوحة — ProjectFlow" },
      { property: "og:description", content: "مساحة التخطيط البصري للوحة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "مساحة التخطيط البصري للوحة." },
    ],
  }),
  component: BoardPage,
});

function BoardPage() {
  const { boardId, projectId } = Route.useParams();
  const { node } = Route.useSearch();
  const { data: board, isLoading } = useBoard(boardId);
  const project = useProject(projectId);
  const markOpened = useMarkBoardOpened();
  const access = useProjectAccess(projectId);
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
    <div className="flex h-dvh flex-col bg-background">
      <header className="frost hairline-b z-40 flex h-14 shrink-0 items-center gap-2 px-3">
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
            <nav aria-label="مسار التنقل" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Link to="/">الرئيسية</Link>
              <span>/</span>
              <Link to="/project/$projectId" params={{ projectId }} className="truncate">{project.data?.name ?? board.project_name}</Link>
              <span className="hidden sm:inline">· {BOARD_TYPE_LABELS[board.board_type]}</span>
            </nav>
          )}
        </div>
      </header>
      {board && (
        <BoardCanvas boardId={boardId} projectId={projectId} initialFocusNodeId={node} readOnly={!(access.data?.can_edit ?? false)} />
      )}

    </div>
  );
}

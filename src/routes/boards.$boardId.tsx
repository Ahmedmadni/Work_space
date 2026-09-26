import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Circle, Hand, MousePointer2, Square, StickyNote, Type, ArrowUpLeft, Star } from "lucide-react";
import { useState } from "react";

import { useBoard, useToggleFavorite } from "@/hooks/use-boards";
import { BOARD_TYPE_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/boards/$boardId")({
  head: () => ({
    meta: [
      { title: "اللوحة — ProjectFlow" },
      { name: "description", content: "مساحة التخطيط البصري للوحة." },
      { property: "og:title", content: "اللوحة — ProjectFlow" },
      { property: "og:description", content: "مساحة التخطيط البصري للوحة." },
    ],
  }),
  component: BoardPage,
});

const TOOLS = [
  { id: "select", label: "تحديد", icon: MousePointer2 },
  { id: "hand", label: "تحريك", icon: Hand },
  { id: "rect", label: "مستطيل", icon: Square },
  { id: "circle", label: "دائرة", icon: Circle },
  { id: "note", label: "ملاحظة", icon: StickyNote },
  { id: "text", label: "نص", icon: Type },
  { id: "arrow", label: "سهم", icon: ArrowUpLeft },
];

function BoardPage() {
  const { boardId } = Route.useParams();
  const { data: board, isLoading } = useBoard(boardId);
  const fav = useToggleFavorite();
  const [tool, setTool] = useState("select");
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="frost hairline-b z-10 flex h-14 items-center gap-3 px-4">
        <Link to={board ? "/projects/$projectId" : "/"} params={board ? { projectId: board.project_id } : undefined as never}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="رجوع">
          <ChevronRight className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">{isLoading ? "…" : board?.name ?? "لوحة غير موجودة"}</p>
          {board && <p className="truncate text-xs text-muted-foreground">{board.workspace_name} / {board.project_name}</p>}
        </div>
        {board && (
          <button onClick={() => fav.mutate(board.id)} aria-label="المفضلة" className="ms-2 text-muted-foreground hover:text-warning">
            <Star className={cn("h-4 w-4", board.is_favorite && "fill-warning text-warning")} />
          </button>
        )}
        <span className="ms-auto rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">محرك الرسم قادم في المرحلة التالية</span>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <div className="frost-strong absolute start-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-2xl p-1.5">
          {TOOLS.map((t) => (
            <button key={t.id} title={t.label} aria-label={t.label} onClick={() => setTool(t.id)}
              className={cn("grid h-10 w-10 place-items-center rounded-xl", tool === t.id ? "bg-brand text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="canvas-grid flex-1">
          <div className="relative mx-auto mt-24 h-80 max-w-2xl">
            <div className="absolute start-10 top-4 rounded-2xl border border-brand/40 bg-brand/10 px-6 py-4 font-semibold text-brand shadow-[var(--shadow-frost)]">الفكرة المركزية</div>
            <div className="absolute end-10 top-24 rotate-2 rounded-lg bg-warning/25 p-4 text-sm shadow-[var(--shadow-frost)]">ملاحظة: حدّد الأهداف أولًا</div>
            <div className="absolute start-40 top-52 rounded-full border border-info/40 bg-info/10 px-5 py-3 text-sm text-info">المرحلة الأولى</div>
          </div>
        </div>
        <aside className="hidden w-72 shrink-0 border-s border-border bg-card p-5 lg:block">
          <h2 className="mb-4 font-semibold">خصائص اللوحة</h2>
          {board && (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted-foreground">النوع</dt><dd>{BOARD_TYPE_LABELS[board.board_type]}</dd></div>
              <div><dt className="text-muted-foreground">المشروع</dt><dd>{board.project_name}</dd></div>
              <div><dt className="text-muted-foreground">آخر تعديل</dt><dd>{relativeTime(board.updated_at)}</dd></div>
              <div><dt className="text-muted-foreground">الأداة الحالية</dt><dd>{TOOLS.find((t) => t.id === tool)?.label}</dd></div>
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}

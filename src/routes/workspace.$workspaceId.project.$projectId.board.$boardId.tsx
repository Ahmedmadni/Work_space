import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Hand, MousePointer2, Circle, Type, Square, Spline, Pencil, Image, Undo2, Redo2, Share2, ZoomIn, ZoomOut, Maximize, PanelLeft } from "lucide-react";
import { useState } from "react";

import { useBoard } from "@/hooks/use-boards";
import { BOARD_TYPE_LABELS } from "@/lib/labels";
import { NotFoundState } from "@/components/app/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/$workspaceId/project/$projectId/board/$boardId")({
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
  { label: "تحديد", icon: MousePointer2 }, { label: "تحريك", icon: Hand }, { label: "عقدة", icon: Circle },
  { label: "نص", icon: Type }, { label: "شكل", icon: Square }, { label: "موصل", icon: Spline },
  { label: "رسم", icon: Pencil }, { label: "صورة", icon: Image },
];

function Disabled({ label, icon: Icon }: { label: string; icon: typeof Undo2 }) {
  return <button disabled title={`${label} (قريبًا)`} aria-label={label} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground opacity-40"><Icon className="h-4 w-4" /></button>;
}

function BoardPage() {
  const { boardId, workspaceId, projectId } = Route.useParams();
  const { data: board, isLoading } = useBoard(boardId);
  const [inspector, setInspector] = useState(true);
  if (!isLoading && !board) return <div className="p-8"><NotFoundState /></div>;
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="frost hairline-b z-10 flex h-14 items-center gap-2 px-3">
        <Link to="/workspace/$workspaceId/project/$projectId" params={{ workspaceId, projectId }} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="رجوع"><ChevronRight className="h-5 w-5" /></Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">{board?.name ?? "…"}</p>
          {board && <p className="truncate text-xs text-muted-foreground">{board.workspace_name} / {board.project_name} · {BOARD_TYPE_LABELS[board.board_type]}</p>}
        </div>
        <span className="ms-3 hidden rounded-full bg-success/15 px-2.5 py-0.5 text-xs text-success sm:inline">تم الحفظ</span>
        <div className="ms-auto flex items-center">
          <Disabled label="تراجع" icon={Undo2} /><Disabled label="إعادة" icon={Redo2} /><Disabled label="مشاركة" icon={Share2} />
          <button onClick={() => setInspector((v) => !v)} aria-label="لوحة الخصائص" className="hidden h-9 w-9 place-items-center rounded-lg hover:bg-muted lg:grid"><PanelLeft className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <div className="frost-strong absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-2xl p-1.5 md:bottom-auto md:left-auto md:start-4 md:top-1/2 md:translate-x-0 md:-translate-y-1/2 md:flex-col">
          {TOOLS.map((t, i) => (
            <button key={t.label} title={i === 0 ? t.label : `${t.label} (قريبًا)`} aria-label={t.label} disabled={i !== 0}
              className={cn("grid h-10 w-10 place-items-center rounded-xl", i === 0 ? "bg-brand text-primary-foreground" : "text-muted-foreground opacity-50")}>
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="canvas-grid relative flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-6 flex w-fit items-center gap-3">
              <span className="h-10 w-16 rounded-xl border border-brand/40 bg-brand/15" /><span className="h-px w-10 bg-border" />
              <span className="h-10 w-10 rounded-full border border-info/40 bg-info/15" /><span className="h-px w-10 bg-border" />
              <span className="h-10 w-14 rotate-3 rounded-md bg-warning/25" />
            </div>
            <h2 className="text-xl font-semibold">مساحة العمل البصرية</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">سنحوّل هذه المساحة في المرحلة التالية إلى لوحة لا نهائية تفاعلية.</p>
          </div>
          <div className="frost absolute bottom-4 end-4 hidden items-center gap-1 rounded-xl p-1 md:flex">
            <Disabled label="تصغير" icon={ZoomOut} /><span className="px-2 text-xs text-muted-foreground">١٠٠٪</span><Disabled label="تكبير" icon={ZoomIn} /><Disabled label="ملاءمة" icon={Maximize} />
          </div>
        </div>
        {inspector && (
          <aside className="hidden w-72 shrink-0 border-s border-border bg-card p-5 lg:block">
            <h3 className="font-semibold">لا يوجد عنصر محدد</h3>
            <p className="mt-2 text-sm text-muted-foreground">حدد عنصرًا من مساحة العمل لعرض خصائصه.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

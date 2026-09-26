import { Link } from "@tanstack/react-router";
import { Star, LayoutGrid, FolderKanban } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ACCENT_CHIP_CLASS, BOARD_TYPE_LABELS, PROJECT_STATUS_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccentColor, BoardWithContext, Project, ProjectStatus } from "@/types";
import { useToggleFavorite } from "@/hooks/use-boards";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-medium text-brand">{eyebrow}</p>}
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Glyph({ icon, color, size = "md" }: { icon: string; color: AccentColor; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-7 w-7 text-sm" : size === "lg" ? "h-12 w-12 text-xl" : "h-9 w-9 text-base";
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl font-bold", s, ACCENT_CHIP_CLASS[color])}>
      {icon}
    </span>
  );
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: "bg-info/15 text-info",
  active: "bg-success/15 text-success",
  on_hold: "bg-warning/15 text-warning",
  completed: "bg-brand/12 text-brand",
  archived: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CLASS[status])}>
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="canvas-grid flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand/12 text-brand">
        <LayoutGrid className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

export function BoardCard({ board }: { board: BoardWithContext }) {
  const fav = useToggleFavorite();
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <Link to="/boards/$boardId" params={{ boardId: board.id }} className="block">
        <div className="canvas-grid relative h-28 border-b border-border bg-muted/40">
          <div className="absolute start-6 top-6 h-8 w-20 rounded-lg bg-brand/20" />
          <div className="absolute start-32 top-12 h-10 w-16 rounded-lg bg-info/20" />
          <div className="absolute end-8 top-5 h-6 w-14 rounded-full bg-warning/25" />
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground">{BOARD_TYPE_LABELS[board.board_type]}</p>
          <h3 className="mt-1 font-semibold text-foreground">{board.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {board.project_name} · {relativeTime(board.updated_at)}
          </p>
        </div>
      </Link>
      <button
        aria-label={board.is_favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
        onClick={() => fav.mutate(board.id)}
        className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-lg frost text-muted-foreground hover:text-warning"
      >
        <Star className={cn("h-4 w-4", board.is_favorite && "fill-warning text-warning")} />
      </button>
    </div>
  );
}

export function ProjectCard({ project, boards }: { project: Project; boards?: number | undefined }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="block rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-start justify-between gap-3">
        <Glyph icon={project.icon} color={project.color} />
        <StatusBadge status={project.status} />
      </div>
      <h3 className="mt-4 font-semibold text-foreground">{project.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description ?? "بلا وصف"}</p>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <FolderKanban className="h-3.5 w-3.5" />
        {boards !== undefined && <span>{boards} لوحات ·</span>}
        <span>{relativeTime(project.updated_at)}</span>
      </div>
    </Link>
  );
}

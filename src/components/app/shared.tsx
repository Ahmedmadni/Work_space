import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  Copy,
  ExternalLink,
  FolderKanban,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  SearchX,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCENT_CHIP_CLASS, BOARD_TYPE_LABELS, PROJECT_STATUS_LABELS } from "@/lib/labels";
import { arabicNumber, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccentColor, BoardType, BoardWithContext, Project, ProjectStatus, WorkspaceWithStats } from "@/types";
import { useArchiveBoard, useDeleteBoard, useToggleFavorite, useUpdateBoard } from "@/hooks/use-boards";
import { useArchiveProject, useDeleteProject, useUpdateProject } from "@/hooks/use-projects";
import { useArchiveWorkspace, useDeleteWorkspace, useUpdateWorkspace } from "@/hooks/use-workspaces";
import { ConfirmDialog, EditEntityDialog } from "./dialogs";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  leading,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {leading}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-sm font-medium text-brand">{eyebrow}</p>}
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Glyph({ icon, color, size = "md" }: { icon: string; color: AccentColor; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-7 w-7 text-sm" : size === "lg" ? "h-12 w-12 text-xl" : "h-9 w-9 text-base";
  return <span className={cn("grid shrink-0 place-items-center rounded-xl font-bold", s, ACCENT_CHIP_CLASS[color])}>{icon}</span>;
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: "bg-info/15 text-info",
  active: "bg-success/15 text-success",
  on_hold: "bg-warning/15 text-warning",
  completed: "bg-brand/12 text-brand",
  archived: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CLASS[status])}>{PROJECT_STATUS_LABELS[status]}</span>;
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = LayoutGrid,
  compact,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  return (
    <div className={cn("canvas-grid flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center", compact ? "py-10" : "py-16")}>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand/12 text-brand"><Icon className="h-6 w-6" /></div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function NoResults({ query }: { query: string }) {
  return <EmptyState icon={SearchX} title="لا توجد نتائج" description={`لم نجد شيئًا يطابق «${query}». جرّب كلمة أخرى.`} compact />;
}

export function ErrorState({ message = "حدث خطأ أثناء تحميل البيانات.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-danger/30 bg-danger/5 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-danger" />
      <p className="font-medium text-foreground">{message}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

export function NotFoundState({ backTo = "/" as const }: { backTo?: "/" | "/workspaces" }) {
  return (
    <EmptyState
      icon={SearchX}
      title="العنصر غير موجود أو تم حذفه."
      description="ربما حُذف أو أُرشف، أو أن الرابط غير صحيح."
      action={<Button asChild><Link to={backTo}>العودة</Link></Button>}
    />
  );
}

export function CardGridSkeleton({ count = 3, tall }: { count?: number; tall?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5">
          {tall && <Skeleton className="-mx-5 -mt-5 mb-4 h-28 rounded-b-none rounded-t-2xl" />}
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="mt-4 h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-4 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** تمثيل مصغّر مجرّد لكل نوع لوحة — ليس محرك رسم. */
export function BoardPreview({ type, className }: { type: BoardType; className?: string }) {
  const stroke = "stroke-muted-foreground/40";
  return (
    <div className={cn("canvas-grid relative overflow-hidden bg-muted/40", className)}>
      <svg viewBox="0 0 200 90" className="absolute inset-0 h-full w-full" aria-hidden>
        {type === "mind_map" && (
          <g className={stroke} strokeWidth="1.5" fill="none">
            <path d="M100 45 L45 20 M100 45 L45 70 M100 45 L155 18 M100 45 L160 55 M160 55 L180 78" />
            <circle cx="100" cy="45" r="11" className="fill-brand/30 stroke-brand" />
            {[[45, 20], [45, 70], [155, 18], [160, 55], [180, 78]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" className="fill-info/25 stroke-info/60" />)}
          </g>
        )}
        {type === "flowchart" && (
          <g strokeWidth="1.5" fill="none">
            <rect x="15" y="32" width="38" height="24" rx="5" className="fill-brand/25 stroke-brand/70" />
            <path d="M100 26 L122 45 L100 64 L78 45 Z" className="fill-warning/25 stroke-warning/70" />
            <rect x="148" y="14" width="38" height="22" rx="5" className="fill-info/25 stroke-info/60" />
            <rect x="148" y="56" width="38" height="22" rx="5" className="fill-success/25 stroke-success/60" />
            <path d="M53 44 H76 M122 45 L146 25 M122 45 L146 67" className={stroke} />
          </g>
        )}
        {type === "roadmap" && (
          <g strokeWidth="1.5">
            <path d="M15 70 H185" className={stroke} />
            <rect x="18" y="18" width="60" height="10" rx="5" className="fill-brand/40" />
            <rect x="60" y="36" width="70" height="10" rx="5" className="fill-warning/40" />
            <rect x="110" y="54" width="70" height="10" rx="5" className="fill-info/40" />
            {[40, 90, 140].map((x) => <circle key={x} cx={x} cy="70" r="3.5" className="fill-muted-foreground/60" />)}
          </g>
        )}
        {type === "project_plan" && (
          <g>
            {[0, 1, 2].map((c) => (
              <g key={c}>
                <rect x={18 + c * 60} y="14" width="50" height="8" rx="4" className="fill-muted-foreground/25" />
                {[0, 1, 2].slice(0, 3 - c).map((r) => <rect key={r} x={18 + c * 60} y={28 + r * 18} width="50" height="13" rx="4" className={c === 0 ? "fill-brand/25" : c === 1 ? "fill-warning/25" : "fill-success/25"} />)}
              </g>
            ))}
          </g>
        )}
        {type === "brainstorm" && (
          <g>
            {[[20, 12, "fill-warning/35"], [70, 30, "fill-info/30"], [125, 10, "fill-success/30"], [150, 50, "fill-brand/30"], [40, 52, "fill-danger/25"], [98, 58, "fill-warning/30"]].map(([x, y, c]) => (
              <rect key={`${x}`} x={x as number} y={y as number} width="30" height="26" rx="3" className={c as string} transform={`rotate(${((x as number) % 7) - 3} ${x} ${y})`} />
            ))}
          </g>
        )}
        {type === "system_architecture" && (
          <g strokeWidth="1.5" fill="none">
            <path d="M100 22 V45 M100 45 L45 68 M100 45 L155 68 M100 45 V68" className={stroke} />
            <rect x="78" y="8" width="44" height="18" rx="4" className="fill-brand/25 stroke-brand/60" />
            {[23, 78, 133].map((x) => <rect key={x} x={x} y="64" width="44" height="18" rx="4" className="fill-info/20 stroke-info/50" />)}
            <ellipse cx="100" cy="45" rx="9" ry="5" className="fill-warning/40 stroke-warning/60" />
          </g>
        )}
        {type === "blank" && (
          <g strokeWidth="1.5" fill="none" strokeDasharray="4 4" className={stroke}>
            <rect x="70" y="25" width="60" height="40" rx="8" />
          </g>
        )}
      </svg>
    </div>
  );
}

function ActionsMenu({
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  withDuplicate,
}: {
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  withDuplicate?: boolean;
}) {
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button aria-label="خيارات" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onOpen}><ExternalLink className="h-4 w-4" />فتح</DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}><Pencil className="h-4 w-4" />تعديل</DropdownMenuItem>
        {withDuplicate && <DropdownMenuItem disabled><Copy className="h-4 w-4" />نسخ (قريبًا)</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onArchive}><Archive className="h-4 w-4" />أرشفة</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger"><Trash2 className="h-4 w-4" />حذف</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const cardBase = "group relative rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]";

export function WorkspaceCard({ workspace: w, view = "grid" }: { workspace: WorkspaceWithStats; view?: "grid" | "list" }) {
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const update = useUpdateWorkspace();
  const archive = useArchiveWorkspace();
  const remove = useDeleteWorkspace();
  const open = () => void navigate({ to: "/workspace/$workspaceId", params: { workspaceId: w.id } });
  return (
    <div className={cn(cardBase, view === "list" ? "flex items-center gap-4 p-4" : "p-5")}>
      <Link to="/workspace/$workspaceId" params={{ workspaceId: w.id }} className={cn("min-w-0 flex-1", view === "list" && "flex items-center gap-4")}>
        <Glyph icon={w.icon} color={w.color} size={view === "list" ? "md" : "lg"} />
        <div className="min-w-0">
          <h3 className={cn("truncate font-semibold text-foreground", view === "grid" && "mt-4 text-lg")}>{w.name}</h3>
          <p className={cn("text-sm text-muted-foreground", view === "grid" ? "mt-1 line-clamp-2 min-h-10" : "truncate")}>{w.description ?? "بلا وصف"}</p>
          {view === "grid" && <Meta w={w} />}
        </div>
      </Link>
      {view === "list" && <div className="hidden sm:block"><Meta w={w} /></div>}
      <div className={cn(view === "grid" && "absolute end-3 top-3")}>
        <ActionsMenu withDuplicate onOpen={open} onEdit={() => setEdit(true)} onArchive={() => archive.mutate(w.id)} onDelete={() => setDel(true)} />
      </div>
      <EditEntityDialog open={edit} onOpenChange={setEdit} title="تعديل المساحة" initialName={w.name} initialDescription={w.description} pending={update.isPending}
        onSave={(v, done) => update.mutate({ id: w.id, name: v.name, description: v.description }, { onSuccess: done })} />
      <ConfirmDialog open={del} onOpenChange={setDel} title={`حذف «${w.name}»؟`} description="سيتم حذف المشاريع واللوحات التابعة لهذه المساحة نهائيًا. لا يمكن التراجع." onConfirm={() => remove.mutate(w.id)} />
    </div>
  );
}

function Meta({ w }: { w: WorkspaceWithStats }) {
  return <p className="mt-3 text-xs text-muted-foreground">{arabicNumber(w.projects_count)} مشاريع · {arabicNumber(w.boards_count)} لوحات · {relativeTime(w.updated_at)}</p>;
}

export function ProjectCard({ project: p, boards }: { project: Project; boards?: number | undefined }) {
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const update = useUpdateProject();
  const archive = useArchiveProject();
  const remove = useDeleteProject();
  const params = { workspaceId: p.workspace_id, projectId: p.id };
  return (
    <div className={cn(cardBase, "p-5")}>
      <Link to="/workspace/$workspaceId/project/$projectId" params={params} className="block">
        <div className="flex items-start gap-3 pe-10">
          <Glyph icon={p.icon} color={p.color} />
          <StatusBadge status={p.status} />
        </div>
        <h3 className="mt-4 truncate font-semibold text-foreground">{p.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description ?? "بلا وصف"}</p>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <FolderKanban className="h-3.5 w-3.5" />
          {boards !== undefined && <span>{arabicNumber(boards)} لوحات ·</span>}
          <span>{relativeTime(p.updated_at)}</span>
        </div>
      </Link>
      <div className="absolute end-3 top-3">
        <ActionsMenu onOpen={() => void navigate({ to: "/workspace/$workspaceId/project/$projectId", params })} onEdit={() => setEdit(true)} onArchive={() => archive.mutate(p.id)} onDelete={() => setDel(true)} />
      </div>
      <EditEntityDialog open={edit} onOpenChange={setEdit} title="تعديل المشروع" initialName={p.name} initialDescription={p.description} initialStatus={p.status} pending={update.isPending}
        onSave={(v, done) => update.mutate({ id: p.id, name: v.name, description: v.description, ...(v.status ? { status: v.status } : {}) }, { onSuccess: done })} />
      <ConfirmDialog open={del} onOpenChange={setDel} title={`حذف «${p.name}»؟`} description="سيتم حذف المشروع وجميع لوحاته نهائيًا." onConfirm={() => remove.mutate(p.id)} />
    </div>
  );
}

export function BoardCard({ board: b }: { board: BoardWithContext }) {
  const navigate = useNavigate();
  const fav = useToggleFavorite();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const update = useUpdateBoard();
  const archive = useArchiveBoard();
  const remove = useDeleteBoard();
  const params = { workspaceId: b.workspace_id, projectId: b.project_id, boardId: b.id };
  return (
    <div className={cn(cardBase, "overflow-hidden")}>
      <Link to="/workspace/$workspaceId/project/$projectId/board/$boardId" params={params} className="block">
        <BoardPreview type={b.board_type} className="h-28 border-b border-border" />
        <div className="p-4">
          <p className="text-xs font-medium text-brand">{BOARD_TYPE_LABELS[b.board_type]}</p>
          <h3 className="mt-1 truncate font-semibold text-foreground">{b.name}</h3>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{b.description ?? b.project_name}</p>
          <p className="mt-3 text-xs text-muted-foreground">آخر تعديل {relativeTime(b.updated_at)}</p>
        </div>
      </Link>
      <div className="frost absolute end-2 top-2 flex rounded-xl">
        <button aria-label={b.is_favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"} onClick={() => fav.mutate(b.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-warning">
          <Star className={cn("h-4 w-4", b.is_favorite && "fill-warning text-warning")} />
        </button>
        <ActionsMenu onOpen={() => void navigate({ to: "/workspace/$workspaceId/project/$projectId/board/$boardId", params })} onEdit={() => setEdit(true)} onArchive={() => archive.mutate(b.id)} onDelete={() => setDel(true)} />
      </div>
      <EditEntityDialog open={edit} onOpenChange={setEdit} title="تعديل اللوحة" initialName={b.name} initialDescription={b.description} pending={update.isPending}
        onSave={(v, done) => update.mutate({ id: b.id, name: v.name, description: v.description }, { onSuccess: done })} />
      <ConfirmDialog open={del} onOpenChange={setDel} title={`حذف «${b.name}»؟`} description="ستُحذف اللوحة نهائيًا ولا يمكن استعادتها." onConfirm={() => remove.mutate(b.id)} />
    </div>
  );
}

export function BoardGrid({ boards }: { boards: BoardWithContext[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{boards.map((b) => <BoardCard key={b.id} board={b} />)}</div>;
}

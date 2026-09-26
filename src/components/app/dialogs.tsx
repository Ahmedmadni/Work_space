import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateWorkspace } from "@/hooks/use-workspaces";
import { useCreateProject } from "@/hooks/use-projects";
import { useCreateBoard } from "@/hooks/use-boards";
import {
  ACCENT_COLORS,
  ACCENT_SWATCH_CLASS,
  BOARD_TYPE_LABELS,
  BOARD_TYPE_ORDER,
  ICON_CHOICES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AccentColor, BoardType, ProjectStatus } from "@/types";

/** حوار يعمل بوضع التحكم أو عبر trigger. */
type OpenProps = { trigger?: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void };

function useOpen(p: OpenProps) {
  const [inner, setInner] = useState(false);
  const open = p.open ?? inner;
  const setOpen = (o: boolean) => (p.onOpenChange ? p.onOpenChange(o) : setInner(o));
  return [open, setOpen] as const;
}

function ColorPicker({ value, onChange }: { value: AccentColor; onChange: (c: AccentColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="اللون">
      {ACCENT_COLORS.map((c) => (
        <button
          type="button"
          key={c.value}
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.label}
          title={c.label}
          onClick={() => onChange(c.value)}
          className={cn(
            "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition",
            ACCENT_SWATCH_CLASS[c.value],
            value === c.value && "ring-2 ring-foreground",
          )}
        />
      ))}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="الرمز">
      {ICON_CHOICES.map((i) => (
        <button
          type="button"
          key={i}
          role="radio"
          aria-checked={value === i}
          onClick={() => onChange(i)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg border border-border font-bold transition",
            value === i ? "border-brand bg-brand text-primary-foreground" : "bg-muted text-foreground hover:border-brand",
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function NameField({ value, onChange, error, placeholder }: { value: string; onChange: (v: string) => void; error: string | null; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="entity-name">الاسم <span className="text-danger">*</span></Label>
      <Input id="entity-name" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus aria-invalid={!!error} maxLength={80} />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "الاسم مطلوب.";
  if (n.length < 2) return "الاسم قصير جدًا (حرفان على الأقل).";
  return null;
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function CreateWorkspaceDialog(props: OpenProps) {
  const [open, setOpen] = useOpen(props);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("م");
  const [color, setColor] = useState<AccentColor>("brand");
  const [error, setError] = useState<string | null>(null);
  const m = useCreateWorkspace();
  const navigate = useNavigate();
  useEffect(() => { if (open) { setName(""); setDescription(""); setError(null); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.trigger && <DialogTrigger asChild>{props.trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>مساحة عمل جديدة</DialogTitle>
          <DialogDescription>مكان يجمع مشاريع فريق أو قسم واحد.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validateName(name);
            setError(err);
            if (err) return;
            m.mutate(
              { name: name.trim(), description, icon, color },
              {
                onSuccess: (ws) => {
                  setOpen(false);
                  void navigate({ to: "/workspace/$workspaceId", params: { workspaceId: ws.id } });
                },
              },
            );
          }}
        >
          <NameField value={name} onChange={setName} error={error} placeholder="مثال: فريق المنتج" />
          <div className="space-y-2"><Label htmlFor="ws-desc">الوصف</Label><Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="space-y-2"><Label>الرمز</Label><IconPicker value={icon} onChange={setIcon} /></div>
          <div className="space-y-2"><Label>اللون</Label><ColorPicker value={color} onChange={setColor} /></div>
          <DialogFooter><Submit pending={m.isPending}>إنشاء المساحة</Submit></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProjectDialog({ workspaceId, ...props }: OpenProps & { workspaceId: string }) {
  const [open, setOpen] = useOpen(props);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [icon, setIcon] = useState("م");
  const [color, setColor] = useState<AccentColor>("sky");
  const [error, setError] = useState<string | null>(null);
  const m = useCreateProject();
  const navigate = useNavigate();
  useEffect(() => { if (open) { setName(""); setDescription(""); setError(null); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.trigger && <DialogTrigger asChild>{props.trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>مشروع جديد</DialogTitle>
          <DialogDescription>المشروع يضم لوحات التخطيط المرتبطة بهدف واحد.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validateName(name);
            setError(err);
            if (err) return;
            m.mutate(
              { workspace_id: workspaceId, name: name.trim(), description, status, icon, color },
              {
                onSuccess: (p) => {
                  setOpen(false);
                  void navigate({ to: "/workspace/$workspaceId/project/$projectId", params: { workspaceId, projectId: p.id } });
                },
              },
            );
          }}
        >
          <NameField value={name} onChange={setName} error={error} />
          <div className="space-y-2"><Label htmlFor="pr-desc">الوصف</Label><Textarea id="pr-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="space-y-2">
            <Label>الحالة</Label>
            <StatusPicker value={status} onChange={setStatus} />
          </div>
          <div className="space-y-2"><Label>الرمز</Label><IconPicker value={icon} onChange={setIcon} /></div>
          <div className="space-y-2"><Label>اللون</Label><ColorPicker value={color} onChange={setColor} /></div>
          <DialogFooter><Submit pending={m.isPending}>إنشاء المشروع</Submit></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusPicker({ value, onChange }: { value: ProjectStatus; onChange: (s: ProjectStatus) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_STATUS_ORDER.map((s) => (
        <button type="button" key={s} onClick={() => onChange(s)}
          className={cn("rounded-full border px-3 py-1 text-sm transition", value === s ? "border-brand bg-brand/12 text-brand" : "border-border text-muted-foreground hover:text-foreground")}>
          {PROJECT_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

export function CreateBoardDialog({
  workspaceId,
  projectId,
  defaultType = "blank",
  ...props
}: OpenProps & { workspaceId: string; projectId: string; defaultType?: BoardType }) {
  const [open, setOpen] = useOpen(props);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<BoardType>(defaultType);
  const [error, setError] = useState<string | null>(null);
  const m = useCreateBoard();
  const navigate = useNavigate();
  useEffect(() => { if (open) { setName(""); setDescription(""); setError(null); setType(defaultType); } }, [open, defaultType]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.trigger && <DialogTrigger asChild>{props.trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>لوحة جديدة</DialogTitle>
          <DialogDescription>اختر نوع اللوحة الذي يناسب طريقة تفكيرك.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validateName(name);
            setError(err);
            if (err) return;
            m.mutate(
              { workspace_id: workspaceId, project_id: projectId, name: name.trim(), description, board_type: type },
              {
                onSuccess: (b) => {
                  setOpen(false);
                  void navigate({
                    to: "/workspace/$workspaceId/project/$projectId/board/$boardId",
                    params: { workspaceId, projectId, boardId: b.id },
                  });
                },
              },
            );
          }}
        >
          <NameField value={name} onChange={setName} error={error} />
          <div className="space-y-2">
            <Label>نوع اللوحة</Label>
            <div className="grid grid-cols-2 gap-2">
              {BOARD_TYPE_ORDER.map((t) => (
                <button type="button" key={t} onClick={() => setType(t)}
                  className={cn("rounded-xl border p-2.5 text-start text-sm transition", type === t ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground hover:border-brand/50")}>
                  {BOARD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2"><Label htmlFor="bd-desc">الوصف</Label><Textarea id="bd-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <DialogFooter><Submit pending={m.isPending}>إنشاء اللوحة</Submit></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** تعديل الاسم والوصف (والحالة للمشاريع). */
export function EditEntityDialog({
  open,
  onOpenChange,
  title,
  initialName,
  initialDescription,
  initialStatus,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initialName: string;
  initialDescription: string | null;
  initialStatus?: ProjectStatus | undefined;
  pending: boolean;
  onSave: (v: { name: string; description: string | null; status?: ProjectStatus | undefined }, done: () => void) => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [status, setStatus] = useState<ProjectStatus | undefined>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setName(initialName); setDescription(initialDescription ?? ""); setStatus(initialStatus); setError(null); }
  }, [open, initialName, initialDescription, initialStatus]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>حدّث البيانات الأساسية ثم احفظ.</DialogDescription></DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validateName(name);
            setError(err);
            if (err) return;
            onSave({ name: name.trim(), description: description.trim() || null, status }, () => onOpenChange(false));
          }}
        >
          <NameField value={name} onChange={setName} error={error} />
          <div className="space-y-2"><Label htmlFor="ed-desc">الوصف</Label><Textarea id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
          {status && <div className="space-y-2"><Label>الحالة</Label><StatusPicker value={status} onChange={setStatus} /></div>}
          <DialogFooter><Submit pending={pending}>حفظ التغييرات</Submit></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "حذف نهائي",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-danger text-primary-foreground hover:bg-danger/90">{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

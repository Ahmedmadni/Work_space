import { useState, type ReactNode } from "react";

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
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AccentColor, BoardType, ProjectStatus } from "@/types";

function ColorPicker({ value, onChange }: { value: AccentColor; onChange: (c: AccentColor) => void }) {
  return (
    <div className="flex gap-2">
      {ACCENT_COLORS.map((c) => (
        <button
          type="button"
          key={c.value}
          aria-label={c.label}
          onClick={() => onChange(c.value)}
          className={cn(
            "h-7 w-7 rounded-full ring-offset-2 ring-offset-background",
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
    <div className="flex flex-wrap gap-1.5">
      {ICON_CHOICES.map((i) => (
        <button
          type="button"
          key={i}
          onClick={() => onChange(i)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg border border-border font-bold",
            value === i ? "bg-brand text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

export function CreateWorkspaceDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("م");
  const [color, setColor] = useState<AccentColor>("brand");
  const m = useCreateWorkspace();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>مساحة عمل جديدة</DialogTitle>
          <DialogDescription>مكان يجمع مشاريع فريق أو قسم واحد.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            m.mutate(
              { name: name.trim(), description, icon, color },
              { onSuccess: () => { setOpen(false); setName(""); setDescription(""); } },
            );
          }}
        >
          <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: فريق المنتج" autoFocus /></div>
          <div className="space-y-2"><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="space-y-2"><Label>الرمز</Label><IconPicker value={icon} onChange={setIcon} /></div>
          <div className="space-y-2"><Label>اللون</Label><ColorPicker value={color} onChange={setColor} /></div>
          <DialogFooter><Button type="submit" disabled={!name.trim() || m.isPending}>إنشاء المساحة</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProjectDialog({ workspaceId, trigger }: { workspaceId: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [icon, setIcon] = useState("م");
  const [color, setColor] = useState<AccentColor>("sky");
  const m = useCreateProject();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>مشروع جديد</DialogTitle>
          <DialogDescription>المشروع يضم لوحات التخطيط المرتبطة بهدف واحد.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            m.mutate(
              { workspace_id: workspaceId, name: name.trim(), description, status, icon, color },
              { onSuccess: () => { setOpen(false); setName(""); setDescription(""); } },
            );
          }}
        >
          <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="space-y-2"><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="space-y-2">
            <Label>الحالة</Label>
            <div className="flex flex-wrap gap-2">
              {(["planning", "active", "on_hold", "completed"] as ProjectStatus[]).map((s) => (
                <button type="button" key={s} onClick={() => setStatus(s)}
                  className={cn("rounded-full border px-3 py-1 text-sm", status === s ? "border-brand bg-brand/12 text-brand" : "border-border text-muted-foreground")}>
                  {PROJECT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2"><Label>الرمز</Label><IconPicker value={icon} onChange={setIcon} /></div>
          <div className="space-y-2"><Label>اللون</Label><ColorPicker value={color} onChange={setColor} /></div>
          <DialogFooter><Button type="submit" disabled={!name.trim() || m.isPending}>إنشاء المشروع</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateBoardDialog({
  workspaceId,
  projectId,
  trigger,
  defaultType = "blank",
}: {
  workspaceId: string;
  projectId: string;
  trigger: ReactNode;
  defaultType?: BoardType;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<BoardType>(defaultType);
  const m = useCreateBoard();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>لوحة جديدة</DialogTitle>
          <DialogDescription>اختر نوع اللوحة الذي يناسب طريقة تفكيرك.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            m.mutate(
              { workspace_id: workspaceId, project_id: projectId, name: name.trim(), board_type: type },
              { onSuccess: () => { setOpen(false); setName(""); } },
            );
          }}
        >
          <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-2">
            {BOARD_TYPE_ORDER.map((t) => (
              <button type="button" key={t} onClick={() => setType(t)}
                className={cn("rounded-xl border p-3 text-start text-sm", type === t ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground")}>
                {BOARD_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <DialogFooter><Button type="submit" disabled={!name.trim() || m.isPending}>إنشاء اللوحة</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

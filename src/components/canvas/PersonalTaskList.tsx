import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTaskOverdue, localPlanningDay, planningStatusPatch } from "@/lib/personal-planning";
import { cn } from "@/lib/utils";
import type { CanvasNode, CanvasNodeStatus } from "@/types";

const statuses: { value: CanvasNodeStatus; label: string }[] = [
  { value: "planned", label: "لم تبدأ" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "done", label: "مكتملة" },
  { value: "idea", label: "فكرة" },
  { value: "blocked", label: "متوقفة" },
];

export function PersonalTaskList({ nodes, readOnly, saveState, onChange, onAdd }: {
  nodes: CanvasNode[];
  readOnly: boolean;
  saveState: string;
  onChange: (id: string, patch: Partial<CanvasNode>) => void;
  onAdd: (title: string) => void;
}) {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [today, setToday] = useState(localPlanningDay);
  useEffect(() => {
    const timer = setInterval(() => setToday(localPlanningDay()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const tasks = nodes.filter((node) => node.kind === "task");
  const overdue = tasks.filter((node) => isTaskOverdue(node, today));
  const visible = (overdueOnly ? overdue : tasks).slice().sort((a, b) =>
    Number(a.status === "done") - Number(b.status === "done") || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.created_at.localeCompare(b.created_at),
  );

  return (
    <section aria-label="التخطيط الشخصي" className="h-full min-w-0 flex-1 overflow-y-auto overscroll-contain bg-background px-3 pb-28 pt-20 sm:px-8 sm:pb-10">
      <div className="mx-auto max-w-4xl">
        <div className="sticky top-0 z-10 -mx-3 mb-4 flex flex-col gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:px-0">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><ListChecks className="size-5 text-brand" /> مهامي</h2>
            <p className="mt-1 text-xs text-muted-foreground">{tasks.filter((node) => node.status === "done").length} مكتملة من {tasks.length} · {saveState === "saved" ? "تم الحفظ" : saveState === "saving" ? "جارٍ الحفظ…" : "لم يتم الحفظ"}</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:flex" role="group" aria-label="قائمة المهام">
            <Button size="sm" variant={overdueOnly ? "ghost" : "secondary"} aria-pressed={!overdueOnly} onClick={() => setOverdueOnly(false)}>الكل ({tasks.length})</Button>
            <Button size="sm" variant={overdueOnly ? "secondary" : "ghost"} aria-pressed={overdueOnly} onClick={() => setOverdueOnly(true)}><AlertCircle className="text-danger" /> المتأخرة ({overdue.length})</Button>
          </div>
        </div>
        {!readOnly && <form className="mb-6 flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          onAdd(title.trim());
          setTitle("");
          setOverdueOnly(false);
        }}>
          <input aria-label="عنوان المهمة الجديدة" placeholder="مهمة جديدة…" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          <Button type="submit" disabled={!title.trim()} className="h-10"><Plus /> إضافة</Button>
        </form>}
        {visible.length === 0 ? <div className="py-16 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-3 size-9 text-success" />
          <p>{overdueOnly ? "لا توجد مهام متأخرة" : "لا توجد مهام بعد"}</p>
        </div> : <ul className="grid gap-3 sm:gap-0 sm:divide-y sm:divide-border sm:border-y sm:border-border">
          {visible.map((node) => <PersonalTaskRow key={node.id} node={node} overdue={isTaskOverdue(node, today)} readOnly={readOnly} onChange={(patch) => onChange(node.id, patch)} />)}
        </ul>}
      </div>
    </section>
  );
}

function PersonalTaskRow({ node, overdue, readOnly, onChange }: {
  node: CanvasNode;
  overdue: boolean;
  readOnly: boolean;
  onChange: (patch: Partial<CanvasNode>) => void;
}) {
  return <li className={cn("rounded-xl border border-border bg-card p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-4", overdue && "border-danger/50")} aria-label={node.title}>
    <div className="mb-3 flex items-center gap-2">
      <Button variant="ghost" size="icon" disabled={readOnly} aria-label={node.status === "done" ? `إعادة فتح ${node.title}` : `إكمال ${node.title}`} title={node.status === "done" ? "إعادة فتح المهمة" : "إكمال المهمة"} onClick={() => onChange(planningStatusPatch(node, node.status === "done" ? "planned" : "done"))} className={cn("shrink-0", node.status === "done" && "text-success")}>
        {node.status === "done" ? <CheckCircle2 /> : <Circle />}
      </Button>
      <h3 className={cn("min-w-0 flex-1 break-words text-sm font-medium", node.status === "done" && "text-muted-foreground line-through")}>{node.title}</h3>
      {overdue && <span className="shrink-0 text-xs font-medium text-danger">متأخرة</span>}
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:ps-11">
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">الحالة
        <select aria-label={`حالة ${node.title}`} disabled={readOnly} value={node.status} onChange={(event) => onChange(planningStatusPatch(node, event.target.value as CanvasNodeStatus))} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground">
          {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">البداية
        <input type="date" aria-label={`بداية ${node.title}`} disabled={readOnly} value={node.start_date ?? ""} onChange={(event) => onChange({ start_date: event.target.value || null })} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">الموعد النهائي
        <input type="date" aria-label={`موعد ${node.title}`} disabled={readOnly} value={node.due_date ?? ""} onChange={(event) => onChange({ due_date: event.target.value || null })} className={cn("h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground", overdue && "border-danger")} />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">المسؤول
        <input aria-label={`مسؤول ${node.title}`} placeholder="أنا" maxLength={80} disabled={readOnly} defaultValue={node.owner ?? ""} onBlur={(event) => { const v = event.target.value.trim() || null; if (v !== (node.owner ?? null)) onChange({ owner: v }); }} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
      </label>
    </div>
  </li>;
}
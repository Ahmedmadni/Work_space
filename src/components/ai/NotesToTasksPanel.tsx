import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { addTasksToBoard, suggestTasksFromNotes, type DraftTask } from "@/services/ai-tasks.service";
import type { Board, CanvasPriority } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isSupabaseBackend } from "@/lib/backend-config";

const PRIORITY_LABELS: Record<CanvasPriority, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};
const PRIORITY_TONE: Record<CanvasPriority, string> = {
  critical: "bg-destructive/15 text-destructive",
  high: "bg-warning/15 text-warning",
  medium: "bg-info/15 text-info",
  low: "bg-muted text-muted-foreground",
};

export function NotesToTasksPanel({
  projectId,
  boards,
  canEdit,
}: {
  projectId: string;
  boards: Board[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [boardId, setBoardId] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const targetBoard = boards.some((board) => board.id === boardId) ? boardId : boards[0]?.id || "";
  const busy = suggestPending();
  function suggestPending() { return false; }

  const suggest = useMutation({
    mutationFn: () => suggestTasksFromNotes(notes.trim(), projectId),
    onMutate: () => setAddedCount(0),
    onSuccess: (tasks) => setDrafts(tasks),
    onError: (e: Error) => toast.error(e.message),
  });
  const apply = useMutation({
    mutationFn: () => addTasksToBoard(targetBoard, drafts),
    onSuccess: (count) => {
      toast.success(`أُضيفت ${count} مهمة إلى اللوحة.`);
      setDrafts([]);
      setNotes("");
      setAddedCount(count);
      void qc.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canEdit) return null;
  const update = (i: number, patch: Partial<DraftTask>) =>
    setDrafts((d) => d.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <section aria-label="من الملاحظات إلى المهام" className="mb-6 border-b border-border py-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold text-foreground">من الملاحظات إلى المهام</h2>
      </div>
      {!isSupabaseBackend() && <p role="status" className="mt-3 text-sm text-warning">تحويل الملاحظات بالذكاء الاصطناعي ينتظر تفعيل الحسابات السحابية للمشروع.</p>}
      {addedCount > 0 && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />أُضيفت {addedCount} مهمة إلى اللوحة.</p>}
      <textarea
        value={notes}
        aria-label="ملاحظات المشروع"
        disabled={suggest.isPending || apply.isPending}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={8000}
        rows={5}
        placeholder="مثال: نحتاج لإنهاء تصميم صفحة الدفع قبل الخميس، والعميل اشتكى من بطء التطبيق…"
        className="mt-4 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          disabled={!isSupabaseBackend() || notes.trim().length < 10 || suggest.isPending || apply.isPending}
          onClick={() => suggest.mutate()}
          className="whitespace-normal h-auto min-h-9"
        >
          {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {suggest.isPending ? "جارٍ التحليل…" : "اقترح المهام"}
        </Button>
      </div>

      {drafts.length > 0 && (
        <div className="mt-5 space-y-3">
          <ul className="space-y-2">
            {drafts.map((t, i) => (
              <li key={i} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <input
                    value={t.title}
                    disabled={apply.isPending || suggest.isPending}
                    maxLength={80}
                    onChange={(e) => update(i, { title: e.target.value })}
                    aria-label="عنوان المهمة"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                  />
                  <select
                    value={t.priority}
                    disabled={apply.isPending || suggest.isPending}
                    onChange={(e) => update(i, { priority: e.target.value as CanvasPriority })}
                    aria-label="الأولوية"
                    className={cn("rounded-lg px-2 py-1 text-xs font-medium", PRIORITY_TONE[t.priority])}
                  >
                    {(Object.keys(PRIORITY_LABELS) as CanvasPriority[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="icon"
                    type="button"
                    aria-label="حذف المهمة"
                    title="حذف المهمة"
                    disabled={apply.isPending || suggest.isPending}
                    onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                {t.reason && <p className="mt-1 text-xs text-muted-foreground">سبب الأولوية: {t.reason}</p>}
              </li>
            ))}
          </ul>
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">أنشئ لوحة في هذا المشروع أولًا لإضافة المهام إليها.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {boards.length > 1 && <select
                value={targetBoard}
                onChange={(e) => setBoardId(e.target.value)}
                aria-label="اللوحة"
                disabled={apply.isPending || suggest.isPending}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>}
              <Button
                type="button"
                disabled={apply.isPending || suggest.isPending || !targetBoard || drafts.some((task) => !task.title.trim())}
                onClick={() => apply.mutate()}
                className="whitespace-normal h-auto min-h-9"
              >
                {apply.isPending ? "جارٍ الإضافة…" : `أضف ${drafts.length} مهمة إلى اللوحة`}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

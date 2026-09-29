import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addTasksToBoard, suggestTasksFromNotes, type DraftTask } from "@/services/ai-tasks.service";
import type { Board, CanvasPriority } from "@/types";
import { cn } from "@/lib/utils";

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
  projectName,
  boards,
  canEdit,
}: {
  projectName: string;
  boards: Board[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [boardId, setBoardId] = useState("");
  const targetBoard = boardId || boards[0]?.id || "";

  const suggest = useMutation({
    mutationFn: () => suggestTasksFromNotes(notes.trim(), projectName),
    onSuccess: (tasks) => setDrafts(tasks),
    onError: (e: Error) => toast.error(e.message),
  });
  const apply = useMutation({
    mutationFn: () => addTasksToBoard(targetBoard, drafts),
    onSuccess: (count) => {
      toast.success(`أُضيفت ${count} مهمة إلى اللوحة.`);
      setDrafts([]);
      setNotes("");
      void qc.invalidateQueries();
    },
    onError: () => toast.error("تعذر إضافة المهام إلى اللوحة."),
  });

  if (!canEdit) return null;
  const update = (i: number, patch: Partial<DraftTask>) =>
    setDrafts((d) => d.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-frost">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold text-foreground">من الملاحظات إلى المهام</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        اكتب ملاحظاتك بحرية، وسيقترح الذكاء الاصطناعي مهامًا منظمة بأولويات يمكنك مراجعتها قبل إضافتها.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={8000}
        rows={5}
        placeholder="مثال: نحتاج لإنهاء تصميم صفحة الدفع قبل الخميس، والعميل اشتكى من بطء التطبيق…"
        className="mt-4 w-full resize-y rounded-xl border border-input bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={notes.trim().length < 10 || suggest.isPending}
          onClick={() => suggest.mutate()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {suggest.isPending ? "جارٍ التحليل…" : "اقترح المهام"}
        </button>
      </div>

      {drafts.length > 0 && (
        <div className="mt-5 space-y-3">
          <ul className="space-y-2">
            {drafts.map((t, i) => (
              <li key={i} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <input
                    value={t.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    aria-label="عنوان المهمة"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                  />
                  <select
                    value={t.priority}
                    onChange={(e) => update(i, { priority: e.target.value as CanvasPriority })}
                    aria-label="الأولوية"
                    className={cn("rounded-lg px-2 py-1 text-xs font-medium", PRIORITY_TONE[t.priority])}
                  >
                    {(Object.keys(PRIORITY_LABELS) as CanvasPriority[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="حذف المهمة"
                    onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
              <select
                value={targetBoard}
                onChange={(e) => setBoardId(e.target.value)}
                aria-label="اللوحة"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={apply.isPending || !targetBoard}
                onClick={() => apply.mutate()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {apply.isPending ? "جارٍ الإضافة…" : `أضف ${drafts.length} مهمة إلى اللوحة`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

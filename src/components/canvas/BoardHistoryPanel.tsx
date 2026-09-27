import { useRef, useState } from "react";
import {
  ArchiveRestore,
  Camera,
  Download,
  History,
  Image as ImageIcon,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  useBoardVersions,
  useCreateBoardVersion,
  useImportBoardBackup,
  useRestoreBoardVersion,
} from "@/hooks/use-canvas";
import { exportBoardBackup } from "@/services/canvas-history.service";
import type { BoardCanvasSnapshot, CanvasBoardVersion } from "@/types";
import { cn } from "@/lib/utils";

function reasonLabel(version: CanvasBoardVersion) {
  if (version.reason === "manual") return version.label || "Snapshot يدوي";
  if (version.reason === "before_restore") return version.label || "قبل الاستعادة";
  if (version.reason === "import") return version.label || "نسخة مستوردة";
  return "حفظ تلقائي";
}

function formatVersionDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ar-SA", {
    calendar: "gregory",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function downloadBackup(boardId: string, backup: unknown) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `projectflow-board-${boardId}-backup.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function BoardHistoryPanel({
  boardId,
  snapshot,
  open,
  onClose,
  onReplaceSnapshot,
}: {
  boardId: string;
  snapshot: BoardCanvasSnapshot;
  open: boolean;
  onClose: () => void;
  onReplaceSnapshot: (snapshot: BoardCanvasSnapshot) => void;
}) {
  const versions = useBoardVersions(boardId);
  const createVersion = useCreateBoardVersion(boardId);
  const restoreVersion = useRestoreBoardVersion(boardId);
  const importBackup = useImportBoardBackup(boardId);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [label, setLabel] = useState("");
  const [confirmVersionId, setConfirmVersionId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!open) return null;

  const handleSnapshot = async () => {
    try {
      await createVersion.mutateAsync({
        snapshot,
        label: label.trim() || null,
      });
      setLabel("");
      toast.success("تم إنشاء Snapshot للوحة.");
    } catch {
      toast.error("تعذر إنشاء Snapshot.");
    }
  };

  const handleRestore = async (versionId: string) => {
    try {
      const restored = await restoreVersion.mutateAsync(versionId);
      onReplaceSnapshot(restored);
      setConfirmVersionId(null);
      toast.success("تمت استعادة الإصدار بنجاح.");
    } catch {
      toast.error("تعذر استعادة الإصدار.");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const backup = await exportBoardBackup(boardId);
      downloadBackup(boardId, backup);
      toast.success("تم تجهيز النسخة الاحتياطية الكاملة.");
    } catch {
      toast.error("تعذر تصدير النسخة الاحتياطية.");
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      if (file.size > 120 * 1024 * 1024) {
        toast.error("ملف النسخة الاحتياطية كبير جدًا.");
        return;
      }
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const imported = await importBackup.mutateAsync(parsed);
      onReplaceSnapshot(imported);
      toast.success("تم استيراد النسخة الاحتياطية.");
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[backup] failed to import", error);
      toast.error("الملف غير صالح أو تعذر استيراده.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <aside className="absolute inset-y-0 end-0 z-[70] flex w-[min(390px,100vw)] flex-col border-s border-border bg-background/98 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">سجل الإصدارات والنسخ الاحتياطي</h2>
          <p className="text-[11px] text-muted-foreground">
            آخر 20 إصدارًا، مع Checkpoints تلقائية كل عدة دقائق عند تغير المحتوى.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق سجل الإصدارات"
          className="grid h-9 w-9 place-items-center rounded-xl hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="border-b border-border p-4">
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand" />
            <div>
              <p className="text-sm font-semibold">Snapshot يدوي</p>
              <p className="text-[10px] text-muted-foreground">
                استخدمه قبل تعديل كبير أو قرار مهم.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="اسم اختياري للإصدار"
              maxLength={120}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={createVersion.isPending}
              onClick={() => void handleSnapshot()}
              className="rounded-xl bg-brand px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "يجهز…" : "تصدير Backup"}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importBackup.isPending}
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            استيراد Backup
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
          <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ملف الـBackup يتضمن محتوى اللوحة والصور المرفوعة، ويمكن استيراده إلى اللوحة الحالية.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">الإصدارات</h3>
          <span className="text-[10px] text-muted-foreground">
            {versions.isLoading ? "…" : `${versions.data?.length ?? 0} إصدار`}
          </span>
        </div>

        {versions.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : !versions.data?.length ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <History className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">لا توجد إصدارات بعد</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              أنشئ Snapshot يدويًا، أو واصل العمل ليظهر أول Checkpoint تلقائي.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {versions.data.map((version) => {
              const confirming = confirmVersionId === version.id;
              return (
                <article
                  key={version.id}
                  className={cn(
                    "rounded-2xl border p-3",
                    confirming ? "border-warning bg-warning/5" : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{reasonLabel(version)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatVersionDate(version.created_at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px]",
                        version.reason === "manual"
                          ? "bg-brand/10 text-brand"
                          : version.reason === "before_restore"
                            ? "bg-warning/10 text-warning"
                            : version.reason === "import"
                              ? "bg-info/10 text-info"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {version.reason === "auto"
                        ? "تلقائي"
                        : version.reason === "manual"
                          ? "يدوي"
                          : version.reason === "import"
                            ? "استيراد"
                            : "حماية"}
                    </span>
                  </div>

                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {version.node_count} عنصر · {version.edge_count} رابط · {version.stroke_count} رسم
                  </p>

                  {confirming ? (
                    <div className="mt-3 rounded-xl bg-warning/10 p-2.5">
                      <p className="text-[10px] leading-4 text-foreground">
                        سيتم إنشاء نسخة حماية من الوضع الحالي أولًا ثم استعادة هذا الإصدار.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={restoreVersion.isPending}
                          onClick={() => void handleRestore(version.id)}
                          className="flex-1 rounded-lg bg-warning px-2 py-1.5 text-[10px] font-medium text-warning-foreground disabled:opacity-50"
                        >
                          تأكيد الاستعادة
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmVersionId(null)}
                          className="rounded-lg border border-border px-2 py-1.5 text-[10px] hover:bg-muted"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmVersionId(version.id)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-2 text-[10px] hover:bg-muted"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      استعادة هذا الإصدار
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

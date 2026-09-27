import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  migrateLocalDataToCloud,
  previewLocalCloudMigration,
  type LocalCloudMigrationPreview,
  type LocalCloudMigrationProgress,
  type LocalCloudMigrationResult,
} from "@/services/local-cloud-migration.service";

function Count({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function phaseLabel(phase: LocalCloudMigrationProgress["phase"]) {
  if (phase === "preparing") return "التجهيز";
  if (phase === "projects") return "المشاريع";
  if (phase === "boards") return "اللوحات";
  if (phase === "assets") return "الصور";
  if (phase === "canvas") return "محتوى اللوحات";
  if (phase === "versions") return "سجل الإصدارات";
  return "التحقق";
}

export function CloudMigrationPanel() {
  const queryClient = useQueryClient();
  const [includeDemo, setIncludeDemo] = useState(false);
  const [preview, setPreview] = useState<LocalCloudMigrationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<LocalCloudMigrationProgress | null>(null);
  const [result, setResult] = useState<LocalCloudMigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      setPreview(await previewLocalCloudMigration(includeDemo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر فحص البيانات المحلية.");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    void loadPreview();
    // Preview should be re-read whenever the user toggles demo-data inclusion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDemo]);

  const runMigration = async () => {
    if (!confirmed || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const migrationResult = await migrateLocalDataToCloud({
        includeDemo,
        onProgress: setProgress,
      });
      setResult(migrationResult);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["boards"] }),
        queryClient.invalidateQueries({ queryKey: ["canvas"] }),
        queryClient.invalidateQueries({ queryKey: ["canvas-search"] }),
        queryClient.invalidateQueries({ queryKey: ["canvas-versions"] }),
        queryClient.invalidateQueries({ queryKey: ["project-execution-summary"] }),
      ]);
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إكمال الترحيل.");
    } finally {
      setRunning(false);
    }
  };

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <section className="mt-6 max-w-4xl rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <CloudUpload className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">نقل البيانات المحلية إلى السحابة</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              ينقل مشاريعك ولوحاتك ومحتوى الـCanvas والصور وسجل الإصدارات إلى حساب Supabase الحالي.
              العملية قابلة لإعادة التشغيل ولا تحذف أي بيانات من المتصفح.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={previewLoading || running}
          onClick={() => void loadPreview()}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          aria-label="إعادة فحص البيانات المحلية"
          title="إعادة الفحص"
        >
          <RefreshCw className={`h-4 w-4 ${previewLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {previewLoading ? (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : preview ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Count label="مشاريع" value={preview.projects} />
            <Count label="لوحات" value={preview.boards} />
            <Count label="عناصر" value={preview.nodes} />
            <Count label="روابط" value={preview.edges} />
            <Count label="رسومات" value={preview.strokes} />
            <Count label="صور" value={preview.assets} />
            <Count label="إصدارات" value={preview.versions} />
          </div>

          {(preview.excluded_demo_projects > 0 || preview.excluded_demo_boards > 0) && (
            <div className="mt-3 rounded-xl border border-info/25 bg-info/5 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeDemo}
                  onChange={(event) => {
                    setIncludeDemo(event.target.checked);
                    setConfirmed(false);
                    setResult(null);
                  }}
                  disabled={running}
                  className="mt-0.5"
                />
                <span>
                  تضمين بيانات Demo القديمة أيضًا. المستبعد افتراضيًا:
                  {" "}
                  {preview.excluded_demo_projects} مشاريع و{preview.excluded_demo_boards} لوحات.
                </span>
              </label>
            </div>
          )}

          {(preview.remote_project_collisions > 0 || preview.remote_board_collisions > 0) && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 p-3 text-xs">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>
                توجد IDs موجودة بالفعل في السحابة ({preview.remote_project_collisions} مشروع،
                {" "}{preview.remote_board_collisions} لوحة). هذا متوقع عند استئناف ترحيل سابق؛
                سيتم تحديث العناصر المملوكة لنفس الحساب فقط، وأي تعارض ملكية سيُرفض.
              </p>
            </div>
          )}

          {!preview.available ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center">
              <Database className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">لا توجد بيانات محلية مؤهلة للترحيل</p>
              <p className="mt-1 text-xs text-muted-foreground">
                لن يتم إنشاء بيانات Demo تلقائيًا أو رفعها دون اختيارك.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <label className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={running}
                  className="mt-0.5"
                />
                <span>
                  أؤكد أنني أريد رفع هذه البيانات إلى الحساب السحابي الحالي. أفهم أن البيانات
                  المحلية ستبقى كما هي ولن تُحذف بعد الترحيل.
                </span>
              </label>

              <button
                type="button"
                disabled={!confirmed || running}
                onClick={() => void runMigration()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <CloudUpload className="h-4 w-4" />
                {running ? "جارٍ الترحيل…" : "ابدأ الترحيل إلى السحابة"}
              </button>
            </div>
          )}
        </>
      ) : null}

      {running && progress && (
        <div className="mt-5 rounded-2xl border border-brand/20 bg-brand/5 p-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">{phaseLabel(progress.phase)}</span>
            <span className="text-muted-foreground">
              {progress.current}/{progress.total}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{progress.message}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {result && (
        <div
          className={`mt-5 rounded-2xl border p-4 ${
            result.issues.length
              ? "border-warning/30 bg-warning/5"
              : "border-success/30 bg-success/5"
          }`}
        >
          <div className="flex items-start gap-2">
            {result.issues.length ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">
                {result.issues.length
                  ? "اكتمل الترحيل مع عناصر تحتاج مراجعة"
                  : "اكتمل الترحيل والتحقق بنجاح"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.projects_migrated} مشروع · {result.boards_migrated} لوحة ·
                {" "}{result.assets_migrated} صورة · {result.versions_migrated} إصدار ·
                {" "}{result.boards_verified} لوحة تم التحقق منها.
              </p>
            </div>
          </div>

          {result.issues.length > 0 && (
            <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto">
              {result.issues.map((issue, index) => (
                <div
                  key={`${issue.scope}:${issue.id}:${index}`}
                  className="rounded-lg border border-warning/20 bg-background px-3 py-2 text-[11px]"
                >
                  <p className="font-medium">{issue.name}</p>
                  <p className="mt-0.5 text-muted-foreground">{issue.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {error}
        </div>
      )}
    </section>
  );
}

import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

import { useCloudBackendReadiness } from "@/hooks/use-cloud-readiness";
import { BACKEND_CONFIG } from "@/lib/backend-config";

function readableMissing(value: string) {
  const [kind, name] = value.split(":");
  if (kind === "table") return "جدول " + name;
  if (kind === "function") return "RPC " + name;
  if (kind === "column") return "حقل " + name;
  if (kind === "migration") return "Migration " + name;
  return value;
}

export function CloudReadinessPanel() {
  const readiness = useCloudBackendReadiness(
    BACKEND_CONFIG.supabaseConfigured,
  );
  const data = readiness.data;

  const state =
    !BACKEND_CONFIG.supabaseConfigured
      ? "not_configured"
      : readiness.isLoading
        ? "checking"
        : !data?.reachable
          ? "unreachable"
          : data.ready
            ? "ready"
            : "incomplete";

  return (
    <section className="mt-6 max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">جاهزية السحابة</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                فحص مستقل للتأكد من أن قاعدة Supabase تحتوي على كل الجداول والـRPCs
                المطلوبة قبل تشغيلها كمصدر البيانات الأساسي.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!BACKEND_CONFIG.supabaseConfigured || readiness.isFetching}
            onClick={() => void readiness.refetch()}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            title="إعادة فحص السحابة"
            aria-label="إعادة فحص السحابة"
          >
            <RefreshCw
              className={
                readiness.isFetching
                  ? "h-4 w-4 animate-spin"
                  : "h-4 w-4"
              }
            />
          </button>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {state === "not_configured" && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold">Supabase غير مهيأ</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY غير متوفرين في البيئة الحالية.
              </p>
            </div>
          </div>
        )}

        {state === "checking" && (
          <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            جاري التحقق من Schema السحابة…
          </div>
        )}

        {state === "unreachable" && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold">تعذر الوصول إلى السحابة</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                الإعدادات موجودة لكن فحص Supabase لم يكتمل. لم يتم تغيير مصدر البيانات.
              </p>
              {data?.error && (
                <p className="mt-2 break-all text-[10px] text-danger">
                  {data.error}
                </p>
              )}
            </div>
          </div>
        )}

        {state === "incomplete" && data && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4">
              <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  السحابة متصلة لكن الـSchema غير مكتمل
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  لن يتم تفعيل Supabase كمصدر البيانات حتى ينجح الفحص بالكامل.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[10px] text-muted-foreground">Schema Version</p>
                <p className="mt-1 text-lg font-semibold">
                  {data.schema_version}/{data.expected_schema_version}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[10px] text-muted-foreground">الفحوص الناجحة</p>
                <p className="mt-1 text-lg font-semibold">
                  {data.checks_passed}/{data.checks_total || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[10px] text-muted-foreground">مصدر البيانات الحالي</p>
                <p className="mt-1 text-sm font-semibold">
                  {BACKEND_CONFIG.mode === "supabase"
                    ? "Supabase Cloud"
                    : "Local Browser"}
                </p>
              </div>
            </div>

            {!!data.missing.length && (
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-semibold">العناصر الناقصة</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.missing.map((item) => (
                    <span
                      key={item}
                      className="rounded-lg bg-warning/10 px-2 py-1 text-[10px] text-warning"
                    >
                      {readableMissing(item)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state === "ready" && data && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="text-sm font-semibold">Cloud Schema: PASS</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Schema version {data.schema_version} وكل الفحوص الحرجة
                  ({data.checks_passed}/{data.checks_total}) ناجحة.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/25 p-3 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              <span>
                Contract: {data.backend_contract ?? "projectflow.cloud.v1"}
              </span>
              <span>·</span>
              <span>
                Backend الحالي:{" "}
                <strong className="text-foreground">
                  {BACKEND_CONFIG.mode === "supabase"
                    ? "Supabase Cloud"
                    : "Local Browser"}
                </strong>
              </span>
            </div>

            {BACKEND_CONFIG.mode !== "supabase" && (
              <div className="rounded-xl border border-info/25 bg-info/5 p-4">
                <p className="text-xs font-semibold text-info">
                  السحابة جاهزة لكن لم يتم تفعيلها كمصدر أساسي بعد
                </p>
                <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
                  التفعيل الإنتاجي يتم عبر VITE_DATA_BACKEND=supabase ثم إعادة النشر.
                  ترك الوضع Local الآن يحمي البيانات المحلية حتى تتم خطوة التفعيل المقصودة.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

import type { ReactNode } from "react";
import {
  AlertTriangle,
  DatabaseZap,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";

import { useCloudBackendReadiness } from "@/hooks/use-cloud-readiness";
import { BACKEND_CONFIG } from "@/lib/backend-config";

function itemLabel(value: string) {
  const [kind, name] = value.split(":");
  if (kind === "table") return "جدول " + name;
  if (kind === "function") return "RPC " + name;
  if (kind === "column") return "حقل " + name;
  if (kind === "migration") return "Migration " + name;
  return value;
}

export function CloudBackendSafetyGate({
  children,
  bypass = false,
}: {
  children: ReactNode;
  bypass?: boolean;
}) {
  const readiness = useCloudBackendReadiness(
    BACKEND_CONFIG.mode === "supabase" && !bypass,
  );

  if (BACKEND_CONFIG.mode !== "supabase" || bypass) {
    return children;
  }

  if (readiness.isLoading || readiness.isFetching && !readiness.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="text-center">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-brand" />
          <p className="mt-3 text-sm font-medium">جاري التحقق من جاهزية السحابة…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            لن يبدأ التطبيق قبل التأكد من تطابق قاعدة البيانات مع الإصدار الحالي.
          </p>
        </div>
      </div>
    );
  }

  const data = readiness.data;
  if (data?.ready) return children;

  const unreachable = !data?.reachable;

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-frost)] sm:p-8">
        <div
          className={
            unreachable
              ? "grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger"
              : "grid h-12 w-12 place-items-center rounded-2xl bg-warning/10 text-warning"
          }
        >
          {unreachable ? (
            <WifiOff className="h-6 w-6" />
          ) : (
            <ShieldAlert className="h-6 w-6" />
          )}
        </div>

        <h1 className="mt-5 text-xl font-semibold">
          تم إيقاف تشغيل Cloud mode لحماية البيانات
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          التطبيق مضبوط على Supabase، لكن فحص الجاهزية لم ينجح. لم يتم تحميل المشاريع
          أو تنفيذ أي ترحيل حتى لا نعمل فوق Schema غير مكتمل.
        </p>

        {unreachable ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-4 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>
              تعذر الوصول إلى Supabase أو إلى Readiness RPC.
              {data?.error ? " " + data.error : ""}
            </span>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[10px] text-muted-foreground">Schema</p>
                <p className="mt-1 text-lg font-semibold">
                  {data?.schema_version ?? 0}/{data?.expected_schema_version ?? 15}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[10px] text-muted-foreground">الفحوص</p>
                <p className="mt-1 text-lg font-semibold">
                  {data?.checks_passed ?? 0}/{data?.checks_total || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[10px] text-muted-foreground">الحالة</p>
                <p className="mt-1 text-sm font-semibold text-warning">Blocked safely</p>
              </div>
            </div>

            {!!data?.missing.length && (
              <div className="mt-3 rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <DatabaseZap className="h-4 w-4 text-warning" />
                  <p className="text-xs font-semibold">العناصر الناقصة</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.missing.map((item) => (
                    <span
                      key={item}
                      className="rounded-lg bg-warning/10 px-2 py-1 text-[10px] text-warning"
                    >
                      {itemLabel(item)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void readiness.refetch()}
            disabled={readiness.isFetching}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={
                readiness.isFetching
                  ? "h-4 w-4 animate-spin"
                  : "h-4 w-4"
              }
            />
            إعادة الفحص
          </button>
          <a
            href="/settings"
            className="inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            فتح إعدادات السحابة
          </a>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/shared";
import { CloudMigrationPanel } from "@/components/settings/CloudMigrationPanel";
import { CloudReadinessPanel } from "@/components/settings/CloudReadinessPanel";
import { useCurrentUser } from "@/hooks/use-auth";
import { useCloudBackendReadiness } from "@/hooks/use-cloud-readiness";
import { BACKEND_CONFIG } from "@/lib/backend-config";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — ProjectFlow" },
      { name: "description", content: "إعدادات الحساب والتفضيلات." },
      { property: "og:title", content: "الإعدادات — ProjectFlow" },
      { property: "og:description", content: "إعدادات الحساب والتفضيلات." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading } = useCurrentUser();
  const readiness = useCloudBackendReadiness(
    BACKEND_CONFIG.supabaseConfigured,
  );

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description={
          BACKEND_CONFIG.mode === "supabase"
            ? "إعدادات حسابك المتصل وبيئة البيانات."
            : "إعدادات وضع التطوير المحلي."
        }
      />
      <div className="max-w-lg rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">الاسم</p>
        <p className="font-medium">{loading ? "جارٍ التحميل…" : user?.full_name ?? "—"}</p>

        <p className="mt-4 text-sm text-muted-foreground">البريد</p>
        <p className="font-medium" dir="ltr">{user?.email || "—"}</p>

        <p className="mt-4 text-sm text-muted-foreground">مصدر البيانات</p>
        <p className="font-medium">
          {BACKEND_CONFIG.mode === "supabase" ? "Supabase Cloud" : "Local Browser"}
        </p>

        <p className="mt-6 text-sm text-muted-foreground">
          يمكنك تبديل الوضع الليلي من زر القمر أعلى الصفحة.
        </p>
      </div>

      <CloudReadinessPanel />

      {BACKEND_CONFIG.mode === "supabase" && readiness.data?.ready && (
        <CloudMigrationPanel />
      )}
    </>
  );
}

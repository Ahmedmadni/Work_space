import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/shared";
import { CURRENT_USER } from "@/services/local-db";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — ProjectFlow" },
      { name: "description", content: "إعدادات الحساب والتفضيلات." },
      { property: "og:title", content: "الإعدادات — ProjectFlow" },
      { property: "og:description", content: "إعدادات الحساب والتفضيلات." },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="الإعدادات" description="ستتوفر إعدادات الحساب والفريق بعد ربط الخادم." />
      <div className="max-w-lg rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">الاسم</p><p className="font-medium">{CURRENT_USER.full_name}</p>
        <p className="mt-4 text-sm text-muted-foreground">البريد</p><p className="font-medium">{CURRENT_USER.email}</p>
        <p className="mt-6 text-sm text-muted-foreground">يمكنك تبديل الوضع الليلي من زر القمر أعلى الصفحة.</p>
      </div>
    </>
  ),
});

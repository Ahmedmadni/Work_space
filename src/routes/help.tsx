import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/shared";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "المساعدة — ProjectFlow" },
      { name: "description", content: "كيف تبدأ مع ProjectFlow." },
      { property: "og:title", content: "المساعدة — ProjectFlow" },
      { property: "og:description", content: "كيف تبدأ مع ProjectFlow." },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="المساعدة" description="ثلاث خطوات للبدء." />
      <ol className="max-w-xl space-y-3">
        {["أنشئ مساحة عمل لفريقك.", "أضف مشروعًا داخل المساحة.", "أنشئ لوحة تخطيط داخل المشروع."].map((s, i) => (
          <li key={s} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/12 font-bold text-brand">{i + 1}</span>{s}
          </li>
        ))}
      </ol>
    </>
  ),
});

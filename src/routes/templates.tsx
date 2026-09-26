import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { BoardPreview, PageHeader } from "@/components/app/shared";
import { BOARD_TYPE_LABELS, TEMPLATES } from "@/lib/labels";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "القوالب — ProjectFlow" },
      { name: "description", content: "قوالب جاهزة للخرائط الذهنية وخطط المشاريع وخرائط الطريق." },
      { property: "og:title", content: "القوالب — ProjectFlow" },
      { property: "og:description", content: "قوالب جاهزة لبدء التخطيط بسرعة." },
    ],
  }),
  component: Templates,
});

function Templates() {
  return (
    <>
      <PageHeader title="القوالب" description="نقاط انطلاق جاهزة لأشكال التخطيط الشائعة." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
            <BoardPreview type={t.board_type} className="mb-4 h-24 rounded-xl" />
            <p className="text-xs text-muted-foreground">{BOARD_TYPE_LABELS[t.board_type]}</p>
            <h3 className="mt-1 font-semibold">{t.name}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
            <span title="سيتم تفعيل إنشاء اللوحات من القوالب في مرحلة لاحقة." className="mt-4">
              <Button variant="outline" disabled className="w-full">استخدام القالب (قريبًا)</Button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

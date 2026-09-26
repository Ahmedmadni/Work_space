import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/shared";
import { CreateBoardDialog } from "@/components/app/dialogs";
import { useProjects } from "@/hooks/use-projects";
import { ACCENT_CHIP_CLASS, BOARD_TYPE_LABELS, TEMPLATES } from "@/lib/labels";
import { cn } from "@/lib/utils";

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
  const { data: projects } = useProjects();
  const target = projects?.[0];
  return (
    <>
      <PageHeader title="القوالب" description={target ? `ستُنشأ اللوحة داخل مشروع «${target.name}».` : "أنشئ مشروعًا أولًا لاستخدام القوالب."} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
            <div className={cn("canvas-grid mb-4 h-24 rounded-xl", ACCENT_CHIP_CLASS[t.color])} />
            <p className="text-xs text-muted-foreground">{BOARD_TYPE_LABELS[t.board_type]}</p>
            <h3 className="mt-1 font-semibold">{t.name}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
            {target && (
              <CreateBoardDialog workspaceId={target.workspace_id} projectId={target.id} defaultType={t.board_type}
                trigger={<Button variant="outline" className="mt-4">استخدام القالب</Button>} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

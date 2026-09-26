import { createFileRoute } from "@tanstack/react-router";
import { Clock, Search } from "lucide-react";
import { useState } from "react";

import { BoardGrid, CardGridSkeleton, EmptyState, NoResults, PageHeader } from "@/components/app/shared";
import { useBoards } from "@/hooks/use-boards";

export const Route = createFileRoute("/recent")({
  head: () => ({
    meta: [
      { title: "آخر اللوحات — ProjectFlow" },
      { name: "description", content: "اللوحات التي عُدّلت مؤخرًا." },
      { property: "og:title", content: "آخر اللوحات — ProjectFlow" },
      { property: "og:description", content: "اللوحات التي عُدّلت مؤخرًا." },
    ],
  }),
  component: Recent,
});

function Recent() {
  const { data, isLoading } = useBoards();
  const [q, setQ] = useState("");
  const rows = (data ?? []).filter((b) => b.name.includes(q.trim()) || b.project_name.includes(q.trim()));
  return (
    <>
      <PageHeader title="آخر اللوحات" description="مرتبة حسب آخر تعديل." />
      <div className="relative mb-6 max-w-xs">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في اللوحات…" className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus:border-brand" />
      </div>
      {isLoading ? <CardGridSkeleton tall /> : !data?.length ? <EmptyState icon={Clock} title="لا لوحات حديثة" description="ستظهر هنا اللوحات التي تعمل عليها." /> : !rows.length ? <NoResults query={q} /> : <BoardGrid boards={rows} />}
    </>
  );
}

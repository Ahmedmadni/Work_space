import { createFileRoute } from "@tanstack/react-router";

import { BoardCard, CardGridSkeleton, EmptyState, PageHeader } from "@/components/app/shared";
import { useBoards } from "@/hooks/use-boards";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "المفضلة — ProjectFlow" },
      { name: "description", content: "اللوحات التي ميّزتها بنجمة." },
      { property: "og:title", content: "المفضلة — ProjectFlow" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "اللوحات التي ميّزتها بنجمة." },
    ],
  }),
  component: Favorites,
});

function Favorites() {
  const { data, isLoading } = useBoards({ favoritesOnly: true });
  return (
    <>
      <PageHeader title="المفضلة" description="وصول سريع إلى اللوحات المهمة." />
      {isLoading ? <CardGridSkeleton /> : !data?.length ? (
        <EmptyState title="لا مفضلات بعد" description="اضغط على النجمة في أي لوحة لإضافتها هنا." />
      ) : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map((b) => <BoardCard key={b.id} board={b} />)}</div>}
    </>
  );
}

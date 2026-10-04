import { Target } from "lucide-react";

import type {
  PortfolioObjective,
  StrategyReviewData,
} from "@/types/strategy";

function progressOf(objective: PortfolioObjective) {
  if (!objective.key_results.length) return null;
  const totalWeight = objective.key_results.reduce(
    (sum, row) => sum + row.weight,
    0,
  );
  if (totalWeight <= 0) return null;

  const progress = objective.key_results.reduce((sum, row) => {
    const baseline = row.baseline_value;
    const target = row.target_value;
    const current = row.current_value;
    let ratio = 0;

    if (row.direction === "increase") {
      const distance = target - baseline;
      ratio =
        distance === 0
          ? current >= target
            ? 100
            : 0
          : ((current - baseline) / distance) * 100;
    } else {
      const distance = baseline - target;
      ratio =
        distance === 0
          ? current <= target
            ? 100
            : 0
          : ((baseline - current) / distance) * 100;
    }

    return sum + Math.max(0, Math.min(100, ratio)) * row.weight;
  }, 0);

  return progress / totalWeight;
}

export function ProjectStrategicAlignment({
  projectId,
  objectives,
  reviewData,
}: {
  projectId: string;
  objectives: PortfolioObjective[];
  reviewData?: StrategyReviewData;
}) {
  const linked = objectives.filter((objective) =>
    objective.project_ids.includes(projectId),
  );

  if (!linked.length) return null;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-brand" />
        <div>
          <h2 className="text-sm font-semibold">الارتباط الاستراتيجي</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            الأهداف الاستراتيجية التي يخدمها هذا المشروع مباشرة.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {linked.map((objective) => {
          const progress = progressOf(objective);
          const milestones = objective.milestones.filter(
            (milestone) => milestone.project_id === projectId,
          );
          const benefits = (reviewData?.benefits ?? []).filter(
            (benefit) => benefit.objective_id === objective.id,
          );
          const realizedBenefits = benefits.filter(
            (benefit) => benefit.status === "realized",
          ).length;
          const latestReview = (reviewData?.reviews ?? [])
            .filter((review) => review.objective_id === objective.id)
            .slice()
            .sort((a, b) => {
              const byDate = b.review_date.localeCompare(a.review_date);
              return byDate !== 0
                ? byDate
                : b.created_at.localeCompare(a.created_at);
            })[0];

          return (
            <div
              key={objective.id}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {objective.title}
                </p>
                <span className="text-[10px] font-semibold text-brand">
                  {progress == null ? "—" : `${Math.round(progress)}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-[9px] text-muted-foreground">
                {objective.key_results.length} Key Results · {milestones.length}{" "}
                Milestones مرتبطة من هذا المشروع
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[8px]">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                  Benefits {realizedBenefits}/{benefits.length}
                </span>
                {latestReview && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    آخر مراجعة: {latestReview.period_label} ·{" "}
                    {latestReview.assessment === "on_track"
                      ? "على المسار"
                      : latestReview.assessment === "at_risk"
                        ? "معرض للخطر"
                        : latestReview.assessment === "off_track"
                          ? "خارج المسار"
                          : "متحقق"}
                  </span>
                )}
              </div>
              {!!milestones.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {milestones.slice(0, 4).map((milestone) => (
                    <span
                      key={milestone.node_id}
                      className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
                    >
                      {milestone.node_title ?? "Milestone"}
                    </span>
                  ))}
                  {milestones.length > 4 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                      +{milestones.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

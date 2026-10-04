import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Gift,
  Pencil,
  Plus,
  Save,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useRecordStrategyReview,
  useSaveObjectiveBenefit,
} from "@/hooks/use-strategy";
import { arabicNumber } from "@/lib/format";
import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { PortfolioActionCenterData } from "@/types/portfolio-actions";
import type {
  BenefitStatus,
  BenefitType,
  ObjectiveBenefit,
  PortfolioObjective,
  PortfolioStrategyData,
  StrategyReviewAssessment,
  StrategyReviewData,
} from "@/types/strategy";

const BENEFIT_TYPE: Record<BenefitType, string> = {
  financial: "مالي",
  customer: "عميل",
  operational: "تشغيلي",
  risk: "خفض مخاطر",
  capability: "قدرات",
  other: "أخرى",
};

const BENEFIT_STATUS: Record<BenefitStatus, string> = {
  planned: "مخططة",
  realizing: "قيد التحقق",
  realized: "متحققة",
  not_realized: "لم تتحقق",
};

const REVIEW_ASSESSMENT: Record<StrategyReviewAssessment, string> = {
  on_track: "على المسار",
  at_risk: "معرض للخطر",
  off_track: "خارج المسار",
  achieved: "متحقق",
};

interface BenefitDraft {
  objective_id: string;
  id: string | null;
  expected_version: number | null;
  title: string;
  description: string;
  benefit_type: BenefitType;
  status: BenefitStatus;
  target_date: string;
  expected_outcome: string;
  realized_outcome: string;
  evidence: string;
}

interface ReviewDraft {
  objective_id: string;
  period_label: string;
  assessment: StrategyReviewAssessment;
  summary: string;
  decisions_needed: string;
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function defaultPeriodLabel() {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return "Q" + quarter + " " + now.getFullYear();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  }).format(date);
}

function objectiveProgress(objective: PortfolioObjective) {
  if (!objective.key_results.length) return null;
  const totalWeight = objective.key_results.reduce(
    (sum, row) => sum + row.weight,
    0,
  );
  if (totalWeight <= 0) return null;

  return (
    objective.key_results.reduce((sum, row) => {
      const distance =
        row.direction === "increase"
          ? row.target_value - row.baseline_value
          : row.baseline_value - row.target_value;
      const moved =
        row.direction === "increase"
          ? row.current_value - row.baseline_value
          : row.baseline_value - row.current_value;
      const progress =
        distance === 0
          ? row.direction === "increase"
            ? row.current_value >= row.target_value
              ? 100
              : 0
            : row.current_value <= row.target_value
              ? 100
              : 0
          : (moved / distance) * 100;
      return sum + Math.max(0, Math.min(100, progress)) * row.weight;
    }, 0) / totalWeight
  );
}

function liveDeliveryProgress(
  objective: PortfolioObjective,
  execution: ProjectExecutionSummary | undefined,
  boards: BoardWithContext[],
) {
  if (!execution) return null;
  const projects = new Set(objective.project_ids);
  const boardProject = new Map(
    boards.map((board) => [board.id, board.project_id] as const),
  );
  const items = execution.items.filter(
    (item) =>
      projects.has(boardProject.get(item.board_id) ?? "") &&
      (item.node.kind === "task" || item.node.kind === "milestone"),
  );
  if (!items.length) return null;
  return items.reduce((sum, item) => sum + item.node.progress, 0) / items.length;
}

export function ExecutiveStrategyReviewCenter({
  strategy,
  reviewData,
  projects,
  boards,
  execution,
  portfolioActions,
  isLoading,
}: {
  strategy: PortfolioStrategyData | undefined;
  reviewData: StrategyReviewData | undefined;
  projects: Project[];
  boards: BoardWithContext[];
  execution: ProjectExecutionSummary | undefined;
  portfolioActions: PortfolioActionCenterData | undefined;
  isLoading: boolean;
}) {
  const saveBenefit = useSaveObjectiveBenefit();
  const recordReview = useRecordStrategyReview();
  const [benefitDraft, setBenefitDraft] = useState<BenefitDraft | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const objectives = strategy?.objectives ?? [];
  const benefits = reviewData?.benefits ?? [];
  const reviews = reviewData?.reviews ?? [];
  const today = useMemo(todayKey, []);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name] as const)),
    [projects],
  );

  const objectiveRows = useMemo(
    () =>
      objectives.map((objective) => {
        const objectiveReviews = reviews
          .filter((row) => row.objective_id === objective.id)
          .slice()
          .sort((a, b) => {
            const byDate = b.review_date.localeCompare(a.review_date);
            return byDate !== 0
              ? byDate
              : b.created_at.localeCompare(a.created_at);
          });
        const latest = objectiveReviews[0] ?? null;
        const previous = objectiveReviews[1] ?? null;

        const objectiveDelta =
          latest?.objective_progress_snapshot != null &&
          previous?.objective_progress_snapshot != null
            ? latest.objective_progress_snapshot -
              previous.objective_progress_snapshot
            : null;
        const deliveryDelta =
          latest?.delivery_progress_snapshot != null &&
          previous?.delivery_progress_snapshot != null
            ? latest.delivery_progress_snapshot -
              previous.delivery_progress_snapshot
            : null;

        const deliveryOutcomeGap =
          objectiveDelta != null &&
          deliveryDelta != null &&
          deliveryDelta >= 10 &&
          objectiveDelta <= 2;

        const objectiveBenefits = benefits.filter(
          (benefit) => benefit.objective_id === objective.id,
        );
        const realizedBenefits = objectiveBenefits.filter(
          (benefit) => benefit.status === "realized",
        ).length;
        const overdueBenefits = objectiveBenefits.filter(
          (benefit) =>
            (benefit.status === "planned" || benefit.status === "realizing") &&
            !!benefit.target_date &&
            benefit.target_date < today,
        ).length;

        return {
          objective,
          objectiveReviews,
          latest,
          previous,
          objectiveDelta,
          deliveryDelta,
          deliveryOutcomeGap,
          liveObjectiveProgress: objectiveProgress(objective),
          liveDeliveryProgress: liveDeliveryProgress(objective, execution, boards),
          benefitCount: objectiveBenefits.length,
          realizedBenefits,
          overdueBenefits,
        };
      }),
    [objectives, reviews, benefits, today, execution, boards],
  );

  const realizedCount = benefits.filter(
    (benefit) => benefit.status === "realized",
  ).length;
  const overdueBenefitCount = benefits.filter(
    (benefit) =>
      (benefit.status === "planned" || benefit.status === "realizing") &&
      !!benefit.target_date &&
      benefit.target_date < today,
  ).length;
  const gapCount = objectiveRows.filter((row) => row.deliveryOutcomeGap).length;
  const offTrackReviews = reviews.filter(
    (review) =>
      review.assessment === "off_track" || review.assessment === "at_risk",
  ).length;

  function editBenefit(benefit: ObjectiveBenefit) {
    setBenefitDraft({
      objective_id: benefit.objective_id,
      id: benefit.id,
      expected_version: benefit.version,
      title: benefit.title,
      description: benefit.description ?? "",
      benefit_type: benefit.benefit_type,
      status: benefit.status,
      target_date: benefit.target_date ?? "",
      expected_outcome: benefit.expected_outcome ?? "",
      realized_outcome: benefit.realized_outcome ?? "",
      evidence: benefit.evidence ?? "",
    });
  }

  function startBenefit(objectiveId: string) {
    setBenefitDraft({
      objective_id: objectiveId,
      id: null,
      expected_version: null,
      title: "",
      description: "",
      benefit_type: "operational",
      status: "planned",
      target_date: "",
      expected_outcome: "",
      realized_outcome: "",
      evidence: "",
    });
  }

  function startReview(objectiveId: string) {
    setReviewDraft({
      objective_id: objectiveId,
      period_label: defaultPeriodLabel(),
      assessment: "on_track",
      summary: "",
      decisions_needed: "",
    });
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل سجل المراجعات والـBenefits…
        </div>
      </section>
    );
  }

  if (!objectives.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="h-5 w-5 text-brand" />
          المراجعة التنفيذية وتحقيق المنافع
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Snapshots تاريخية للـOKRs والتنفيذ، مع Benefits/Outcomes موثقة بدل
          الاكتفاء بإغلاق المشاريع والمهام.
        </p>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        Delivery Progress = متوسط Progress لكل Tasks وMilestones داخل المشاريع
        المرتبطة بالهدف. تظهر فجوة Delivery–Outcome فقط عندما يتحسن Delivery
        بمقدار 10 نقاط أو أكثر بين مراجعتين بينما يتحسن OKR بمقدار نقطتين أو أقل.
        المراجعات التاريخية Append-only ولا تُعدل بعد تسجيلها.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Benefits متحققة",
            value: realizedCount,
            icon: CheckCircle2,
            tone: "text-success",
          },
          {
            label: "Benefits متأخرة",
            value: overdueBenefitCount,
            icon: CalendarClock,
            tone: "text-danger",
          },
          {
            label: "فجوة Delivery–Outcome",
            value: gapCount,
            icon: TrendingUp,
            tone: "text-warning",
          },
          {
            label: "مراجعات At Risk / Off Track",
            value: offTrackReviews,
            icon: AlertTriangle,
            tone: "text-danger",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
          >
            <div className="flex items-center gap-2">
              <Icon className={"h-4 w-4 " + tone} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{arabicNumber(value)}</p>
          </div>
        ))}
      </div>

      {benefitDraft && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {benefitDraft.id ? "تعديل Benefit" : "Benefit جديدة"}
            </h3>
            <button
              type="button"
              onClick={() => setBenefitDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              العنوان
              <input
                value={benefitDraft.title}
                maxLength={200}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              النوع
              <select
                value={benefitDraft.benefit_type}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current
                      ? {
                          ...current,
                          benefit_type: event.target.value as BenefitType,
                        }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(BENEFIT_TYPE).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              الحالة
              <select
                value={benefitDraft.status}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current
                      ? {
                          ...current,
                          status: event.target.value as BenefitStatus,
                        }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(BENEFIT_STATUS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              Target Date
              <input
                type="date"
                value={benefitDraft.target_date}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current
                      ? { ...current, target_date: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-3 text-[10px] text-muted-foreground">
              الوصف
              <input
                value={benefitDraft.description}
                maxLength={5000}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              Expected Outcome
              <textarea
                rows={3}
                value={benefitDraft.expected_outcome}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current
                      ? { ...current, expected_outcome: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              Realized Outcome
              <textarea
                rows={3}
                value={benefitDraft.realized_outcome}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current
                      ? { ...current, realized_outcome: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-4 text-[10px] text-muted-foreground">
              Evidence / دليل التحقق
              <textarea
                rows={2}
                value={benefitDraft.evidence}
                onChange={(event) =>
                  setBenefitDraft((current) =>
                    current ? { ...current, evidence: event.target.value } : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={!benefitDraft.title.trim() || saveBenefit.isPending}
            onClick={() =>
              saveBenefit.mutate(
                {
                  objective_id: benefitDraft.objective_id,
                  id: benefitDraft.id,
                  expected_version: benefitDraft.expected_version,
                  title: benefitDraft.title,
                  description: benefitDraft.description || null,
                  benefit_type: benefitDraft.benefit_type,
                  status: benefitDraft.status,
                  target_date: benefitDraft.target_date || null,
                  expected_outcome: benefitDraft.expected_outcome || null,
                  realized_outcome: benefitDraft.realized_outcome || null,
                  evidence: benefitDraft.evidence || null,
                },
                { onSuccess: () => setBenefitDraft(null) },
              )
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ Benefit
          </button>
        </div>
      )}

      {reviewDraft && (
        <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Executive Strategy Review</h3>
            <button
              type="button"
              onClick={() => setReviewDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">
              فترة المراجعة
              <input
                value={reviewDraft.period_label}
                maxLength={120}
                onChange={(event) =>
                  setReviewDraft((current) =>
                    current
                      ? { ...current, period_label: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Assessment
              <select
                value={reviewDraft.assessment}
                onChange={(event) =>
                  setReviewDraft((current) =>
                    current
                      ? {
                          ...current,
                          assessment: event.target
                            .value as StrategyReviewAssessment,
                        }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(REVIEW_ASSESSMENT).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              ملخص المراجعة
              <textarea
                rows={4}
                value={reviewDraft.summary}
                onChange={(event) =>
                  setReviewDraft((current) =>
                    current ? { ...current, summary: event.target.value } : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              قرارات مطلوبة
              <textarea
                rows={4}
                value={reviewDraft.decisions_needed}
                onChange={(event) =>
                  setReviewDraft((current) =>
                    current
                      ? { ...current, decisions_needed: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={!reviewDraft.period_label.trim() || recordReview.isPending}
            onClick={() => {
              const row = objectiveRows.find(
                (item) => item.objective.id === reviewDraft.objective_id,
              );
              const linkedProjects = new Set(row?.objective.project_ids ?? []);
              const activeRisks = (portfolioActions?.risks ?? []).filter(
                (risk) =>
                  linkedProjects.has(risk.project_id) &&
                  (risk.status === "open" || risk.status === "mitigating"),
              );
              const pendingDecisions = (portfolioActions?.decisions ?? []).filter(
                (decision) =>
                  linkedProjects.has(decision.project_id) &&
                  decision.status === "proposed",
              ).length;

              recordReview.mutate(
                {
                  objective_id: reviewDraft.objective_id,
                  period_label: reviewDraft.period_label,
                  assessment: reviewDraft.assessment,
                  summary: reviewDraft.summary || null,
                  decisions_needed: reviewDraft.decisions_needed || null,
                  local_delivery_progress: row?.liveDeliveryProgress ?? null,
                  local_active_risks: activeRisks.length,
                  local_critical_risks: activeRisks.filter(
                    (risk) => risk.severity === "critical",
                  ).length,
                  local_pending_decisions: pendingDecisions,
                },
                { onSuccess: () => setReviewDraft(null) },
              );
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <ClipboardCheck className="h-4 w-4" />
            تثبيت Snapshot المراجعة
          </button>
        </div>
      )}

      <div className="space-y-4">
        {objectiveRows.map((row) => {
          const objectiveBenefits = benefits.filter(
            (benefit) => benefit.objective_id === row.objective.id,
          );

          return (
            <article
              key={row.objective.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{row.objective.title}</h3>
                    {row.deliveryOutcomeGap && (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] text-warning">
                        Delivery–Outcome Gap
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {row.objective.project_ids
                      .map((id) => projectMap.get(id) ?? "مشروع")
                      .join(" · ")}
                  </p>
                </div>
                {row.objective.can_edit && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startBenefit(row.objective.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Benefit
                    </button>
                    <button
                      type="button"
                      onClick={() => startReview(row.objective.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      مراجعة
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-muted/25 p-3">
                  <p className="text-[9px] text-muted-foreground">OKR الآن</p>
                  <p className="mt-1 text-lg font-semibold">
                    {row.liveObjectiveProgress == null
                      ? "—"
                      : Math.round(row.liveObjectiveProgress) + "%"}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/25 p-3">
                  <p className="text-[9px] text-muted-foreground">Delivery الآن</p>
                  <p className="mt-1 text-lg font-semibold">
                    {row.liveDeliveryProgress == null
                      ? "—"
                      : Math.round(row.liveDeliveryProgress) + "%"}
                  </p>
                </div>
                <div className="rounded-xl bg-success/5 p-3">
                  <p className="text-[9px] text-muted-foreground">Benefits متحققة</p>
                  <p className="mt-1 text-lg font-semibold text-success">
                    {arabicNumber(row.realizedBenefits)} /{" "}
                    {arabicNumber(row.benefitCount)}
                  </p>
                </div>
                <div className="rounded-xl bg-danger/5 p-3">
                  <p className="text-[9px] text-muted-foreground">Benefits متأخرة</p>
                  <p className="mt-1 text-lg font-semibold text-danger">
                    {arabicNumber(row.overdueBenefits)}
                  </p>
                </div>
              </div>

              {row.deliveryOutcomeGap && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 text-[10px] leading-5 text-warning">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    بين آخر مراجعتين تحسن Delivery بمقدار{" "}
                    {row.deliveryDelta == null ? "—" : row.deliveryDelta.toFixed(1)} نقطة،
                    بينما تغير OKR بمقدار{" "}
                    {row.objectiveDelta == null ? "—" : row.objectiveDelta.toFixed(1)} نقطة فقط.
                    هذا يعني أن تقدم التنفيذ لا ينعكس حاليًا بنفس القوة على النتيجة الاستراتيجية.
                  </span>
                </div>
              )}

              {!!row.objectiveReviews.length && (
                <div className="mt-4">
                  <h4 className="text-[10px] font-semibold">Trend المراجعات</h4>
                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {row.objectiveReviews.slice(0, 4).map((review) => (
                      <div
                        key={review.id}
                        className="rounded-xl border border-border bg-background p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[10px] font-semibold">
                            {review.period_label}
                          </p>
                          <span className="text-[8px] text-muted-foreground">
                            {REVIEW_ASSESSMENT[review.assessment]}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
                          <div>
                            <p className="text-muted-foreground">OKR</p>
                            <p className="font-semibold">
                              {review.objective_progress_snapshot == null
                                ? "—"
                                : Math.round(review.objective_progress_snapshot) + "%"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Delivery</p>
                            <p className="font-semibold">
                              {review.delivery_progress_snapshot == null
                                ? "—"
                                : Math.round(review.delivery_progress_snapshot) + "%"}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-[8px] text-muted-foreground">
                          {formatDate(review.review_date)} ·{" "}
                          {review.critical_risks_snapshot} Critical ·{" "}
                          {review.pending_decisions_snapshot} Decisions
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-brand" />
                  <h4 className="text-[10px] font-semibold">Benefits / Outcomes</h4>
                </div>

                {!objectiveBenefits.length ? (
                  <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                    لم تُسجل Benefits لهذا الهدف بعد.
                  </div>
                ) : (
                  <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {objectiveBenefits.map((benefit) => {
                      const overdue =
                        (benefit.status === "planned" ||
                          benefit.status === "realizing") &&
                        !!benefit.target_date &&
                        benefit.target_date < today;
                      return (
                        <div
                          key={benefit.id}
                          className="flex flex-col gap-2 bg-background p-3 md:flex-row md:items-start"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold">{benefit.title}</p>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                                {BENEFIT_TYPE[benefit.benefit_type]}
                              </span>
                              <span
                                className={
                                  benefit.status === "realized"
                                    ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                                    : benefit.status === "not_realized"
                                      ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                                      : "rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning"
                                }
                              >
                                {BENEFIT_STATUS[benefit.status]}
                              </span>
                              {overdue && (
                                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger">
                                  متأخرة
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[9px] text-muted-foreground">
                              Target: {formatDate(benefit.target_date)}
                            </p>
                            {benefit.expected_outcome && (
                              <p className="mt-2 text-[10px] leading-5">
                                <span className="text-muted-foreground">
                                  Expected:{" "}
                                </span>
                                {benefit.expected_outcome}
                              </p>
                            )}
                            {benefit.realized_outcome && (
                              <p className="mt-1 text-[10px] leading-5 text-success">
                                <span className="text-muted-foreground">
                                  Realized:{" "}
                                </span>
                                {benefit.realized_outcome}
                              </p>
                            )}
                          </div>

                          {row.objective.can_edit && (
                            <button
                              type="button"
                              onClick={() => editBenefit(benefit)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground hover:bg-muted"
                            >
                              <Pencil className="h-3 w-3" />
                              تعديل
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

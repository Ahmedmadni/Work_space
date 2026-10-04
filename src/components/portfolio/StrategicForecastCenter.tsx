import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gauge,
  LineChart,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";

import {
  buildBenefitForecastWarnings,
  buildPortfolioForecasts,
} from "@/services/strategy-forecast.service";
import { arabicNumber } from "@/lib/format";
import type {
  ObjectiveForecast,
  PortfolioStrategyData,
  StrategyReviewData,
} from "@/types/strategy";

const STATUS_META: Record<
  ObjectiveForecast["status"],
  { label: string; className: string }
> = {
  achieved: {
    label: "متحقق",
    className: "bg-success/10 text-success",
  },
  overdue: {
    label: "الموعد تجاوز",
    className: "bg-danger/10 text-danger",
  },
  projected_on_time: {
    label: "متوقع في الموعد",
    className: "bg-success/10 text-success",
  },
  projected_late: {
    label: "متوقع متأخرًا",
    className: "bg-warning/10 text-warning",
  },
  stalled: {
    label: "الاتجاه متوقف/سلبي",
    className: "bg-warning/10 text-warning",
  },
  insufficient_data: {
    label: "بيانات غير كافية",
    className: "bg-muted text-muted-foreground",
  },
};

const EVIDENCE_LABELS: Record<
  ObjectiveForecast["evidence_strength"],
  string
> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "مرتفعة",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value + "T12:00:00Z");
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(date);
}

function weeklyRate(forecast: ObjectiveForecast) {
  return forecast.daily_progress_rate == null
    ? null
    : forecast.daily_progress_rate * 7;
}

function warningText(
  reason: "overdue" | "objective_projected_late" | "objective_stalled",
) {
  if (reason === "overdue") return "تجاوزت Benefit تاريخها المستهدف دون تحقق.";
  if (reason === "objective_stalled") {
    return "موعد Benefit خلال 30 يومًا بينما اتجاه Objective متوقف أو سلبي.";
  }
  return "موعد Benefit خلال 30 يومًا بينما Objective متوقع أن يتأخر.";
}

export function StrategicForecastCenter({
  strategy,
  reviewData,
  isLoading,
}: {
  strategy: PortfolioStrategyData | undefined;
  reviewData: StrategyReviewData | undefined;
  isLoading: boolean;
}) {
  const objectives = strategy?.objectives ?? [];
  const forecasts = useMemo(
    () => buildPortfolioForecasts(objectives, reviewData),
    [objectives, reviewData],
  );
  const benefitWarnings = useMemo(
    () =>
      buildBenefitForecastWarnings(objectives, reviewData, forecasts),
    [objectives, reviewData, forecasts],
  );

  const objectiveMap = useMemo(
    () => new Map(objectives.map((objective) => [objective.id, objective] as const)),
    [objectives],
  );
  const benefitMap = useMemo(
    () =>
      new Map(
        (reviewData?.benefits ?? []).map((benefit) => [benefit.id, benefit] as const),
      ),
    [reviewData?.benefits],
  );

  const projectedLate = forecasts.filter(
    (forecast) => forecast.status === "projected_late",
  ).length;
  const stalled = forecasts.filter(
    (forecast) => forecast.status === "stalled",
  ).length;
  const overdue = forecasts.filter(
    (forecast) => forecast.status === "overdue",
  ).length;
  const onTime = forecasts.filter(
    (forecast) =>
      forecast.status === "projected_on_time" ||
      forecast.status === "achieved",
  ).length;
  const insufficient = forecasts.filter(
    (forecast) => forecast.status === "insufficient_data",
  ).length;
  const highEvidence = forecasts.filter(
    (forecast) => forecast.evidence_strength === "high",
  ).length;

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LineChart className="h-5 w-5 animate-pulse text-brand" />
          جاري حساب الاتجاهات والتوقعات الاستراتيجية…
        </div>
      </section>
    );
  }

  if (!objectives.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <LineChart className="h-5 w-5 text-brand" />
          التوقع الاستراتيجي والإنذار المبكر
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          قراءة تفسيرية للتاريخ الحقيقي للمراجعات؛ التوقع Projection وليس حقيقة
          مستقبلية مؤكدة.
        </p>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        <strong className="text-foreground">Fact</strong> = القيمة الحالية والموعد
        المسجل. <strong className="text-foreground">Trend</strong> = Linear Trend
        من مراجعتين على الأقل وحتى آخر 6 Snapshots.{" "}
        <strong className="text-foreground">Projection</strong> = استمرار هذا
        الاتجاه نفسه دون افتراض تحسن أو تدهور جديد. قوة الدليل ترتفع فقط مع عدد
        مراجعات أكبر وفترة تاريخية أطول.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {
            label: "متوقع في الموعد / متحقق",
            value: onTime,
            icon: CheckCircle2,
            tone: "text-success",
          },
          {
            label: "متوقع متأخرًا",
            value: projectedLate,
            icon: CalendarClock,
            tone: "text-warning",
          },
          {
            label: "Trend متوقف/سلبي",
            value: stalled,
            icon: TrendingDown,
            tone: "text-warning",
          },
          {
            label: "متجاوز الموعد فعليًا",
            value: overdue,
            icon: AlertTriangle,
            tone: "text-danger",
          },
          {
            label: "بيانات غير كافية",
            value: insufficient,
            icon: Clock3,
            tone: "text-muted-foreground",
          },
          {
            label: "دليل تاريخي قوي",
            value: highEvidence,
            icon: Gauge,
            tone: "text-info",
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

      <div className="grid gap-4 xl:grid-cols-2">
        {forecasts.map((forecast) => {
          const objective = objectiveMap.get(forecast.objective_id);
          if (!objective) return null;
          const meta = STATUS_META[forecast.status];
          const rate = weeklyRate(forecast);

          return (
            <article
              key={objective.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {objective.title}
                  </h3>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {forecast.review_count} مراجعات · نطاق تاريخي{" "}
                    {arabicNumber(forecast.history_span_days)} يوم
                  </p>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-1 text-[9px] font-medium " +
                    meta.className
                  }
                >
                  {meta.label}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-brand" />
                    <p className="text-[9px] font-semibold">Fact</p>
                  </div>
                  <p className="mt-2 text-xl font-semibold">
                    {forecast.latest_progress == null
                      ? "—"
                      : Math.round(forecast.latest_progress) + "%"}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    الموعد: {formatDate(objective.due_date)}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {forecast.days_to_due == null
                      ? "لا يوجد Deadline"
                      : forecast.days_to_due >= 0
                        ? arabicNumber(forecast.days_to_due) + " يوم متبقٍ"
                        : "متجاوز " +
                          arabicNumber(Math.abs(forecast.days_to_due)) +
                          " يوم"}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-1.5">
                    {rate != null && rate < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5 text-warning" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5 text-info" />
                    )}
                    <p className="text-[9px] font-semibold">Trend</p>
                  </div>
                  <p className="mt-2 text-xl font-semibold">
                    {rate == null
                      ? "—"
                      : (rate >= 0 ? "+" : "") + rate.toFixed(1) + " نقطة/أسبوع"}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    قوة الدليل: {EVIDENCE_LABELS[forecast.evidence_strength]}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    آخر Snapshot: {formatDate(forecast.latest_review_date)}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-1.5">
                    <LineChart className="h-3.5 w-3.5 text-info" />
                    <p className="text-[9px] font-semibold">Projection</p>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold">
                    الوصول المتوقع:{" "}
                    {formatDate(forecast.projected_completion_date)}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold">
                    عند Deadline:{" "}
                    {forecast.projected_due_progress == null
                      ? "—"
                      : Math.round(forecast.projected_due_progress) + "%"}
                  </p>
                  {forecast.status === "insufficient_data" && (
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      يلزم مراجعتان بتاريخين مختلفين وDeadline للحكم على الموعد.
                    </p>
                  )}
                </div>
              </div>

              {!!forecast.points.length && (
                <div className="mt-3 flex items-end gap-1 rounded-xl bg-muted/20 p-3">
                  {forecast.points.map((point) => (
                    <div
                      key={point.review_id}
                      className="group flex min-w-0 flex-1 flex-col items-center"
                      title={
                        point.review_date +
                        " · " +
                        Math.round(point.progress) +
                        "%"
                      }
                    >
                      <div className="flex h-16 w-full items-end">
                        <div
                          className="w-full rounded-t bg-brand/60"
                          style={{
                            height:
                              Math.max(3, Math.min(100, point.progress)) + "%",
                          }}
                        />
                      </div>
                      <span className="mt-1 hidden text-[7px] text-muted-foreground sm:block">
                        {point.review_date.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold">Early Warning — Benefits</h3>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Fact عند تجاوز Target Date، وProjection فقط عندما تكون Benefit خلال 30
          يومًا والـObjective نفسه متوقعًا متأخرًا أو Trend متوقفًا.
        </p>

        {!benefitWarnings.length ? (
          <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-5 text-center text-xs text-success">
            لا توجد Benefits تستوفي قواعد الإنذار المبكر الحالية.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {benefitWarnings.map((warning) => {
              const benefit = benefitMap.get(warning.benefit_id);
              const objective = objectiveMap.get(warning.objective_id);
              if (!benefit || !objective) return null;
              return (
                <div
                  key={benefit.id}
                  className="flex flex-col gap-2 bg-background p-3 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {benefit.title}
                    </p>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      {objective.title} · Target{" "}
                      {formatDate(benefit.target_date)}
                    </p>
                    <p
                      className={
                        warning.severity === "critical"
                          ? "mt-1 text-[9px] text-danger"
                          : "mt-1 text-[9px] text-warning"
                      }
                    >
                      {warningText(warning.reason)}
                    </p>
                  </div>
                  <span
                    className={
                      warning.severity === "critical"
                        ? "rounded-full bg-danger/10 px-2 py-1 text-[9px] text-danger"
                        : "rounded-full bg-warning/10 px-2 py-1 text-[9px] text-warning"
                    }
                  >
                    {warning.reason === "overdue" ? "Fact" : "Projection"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

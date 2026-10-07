import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FolderKanban,
  Gavel,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { arabicNumber } from "@/lib/format";
import { buildExecutiveGovernanceTrends } from "@/services/governance-trends.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  GovernanceBottleneckRow,
  GovernancePeriodMetric,
  GovernanceTrendDirection,
} from "@/types/governance-trends";

const DIRECTION_META: Record<
  GovernanceTrendDirection,
  { label: string; className: string; icon: typeof ArrowRight }
> = {
  improved: {
    label: "تحسن",
    className: "text-success",
    icon: ArrowUpRight,
  },
  worsened: {
    label: "تراجع",
    className: "text-danger",
    icon: ArrowDownRight,
  },
  unchanged: {
    label: "بدون تغير",
    className: "text-muted-foreground",
    icon: ArrowRight,
  },
  insufficient_data: {
    label: "بيانات غير كافية",
    className: "text-muted-foreground",
    icon: CircleHelp,
  },
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(
    value.length === 10 ? value + "T12:00:00Z" : value,
  );
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  }).format(date);
}

function percent(value: number | null) {
  return value == null ? "—" : arabicNumber(value) + "%";
}

function numeric(value: number | null, suffix = "") {
  return value == null ? "—" : arabicNumber(value) + suffix;
}

function deltaText(metric: GovernancePeriodMetric, suffix = "") {
  if (metric.delta == null) return "—";
  const sign = metric.delta > 0 ? "+" : "";
  return sign + arabicNumber(metric.delta) + suffix;
}

function TrendMetric({
  label,
  metric,
  formatter = percent,
  deltaSuffix = " نقطة",
  note,
  icon: Icon,
}: {
  label: string;
  metric: GovernancePeriodMetric;
  formatter?: (value: number | null) => string;
  deltaSuffix?: string;
  note: string;
  icon: typeof Gavel;
}) {
  const meta = DIRECTION_META[metric.direction];
  const DirectionIcon = meta.icon;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold">{formatter(metric.current)}</p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            السابق: {formatter(metric.previous)}
          </p>
        </div>
        <div className={"text-end " + meta.className}>
          <div className="flex items-center justify-end gap-1 text-[9px] font-semibold">
            <DirectionIcon className="h-3.5 w-3.5" />
            {meta.label}
          </div>
          <p className="mt-1 text-[8px]">
            Δ {deltaText(metric, deltaSuffix)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[8px] leading-4 text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function BottleneckTable({
  rows,
  mode,
}: {
  rows: GovernanceBottleneckRow[];
  mode: "project" | "objective";
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        لا توجد بيانات مرتبطة كفاية لإظهار الاختناقات حسب{" "}
        {mode === "project" ? "المشروع" : "Objective"}.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden grid-cols-[minmax(180px,1.4fr)_70px_80px_90px_80px_80px_80px_100px] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground xl:grid">
        <span>{mode === "project" ? "Project" : "Objective"}</span>
        <span>Meetings</span>
        <span>Deferred</span>
        <span>Repeat def.</span>
        <span>Open</span>
        <span>Overdue</span>
        <span>Unowned</span>
        <span>Median close</span>
      </div>

      {rows.slice(0, 20).map((row) => (
        <div
          key={row.key}
          className="border-t border-border p-3 first:border-t-0 xl:grid xl:grid-cols-[minmax(180px,1.4fr)_70px_80px_90px_80px_80px_80px_100px] xl:items-center xl:gap-2"
        >
          <div>
            <p className="text-xs font-semibold">{row.label}</p>
            <p className="mt-1 text-[8px] text-muted-foreground">
              {arabicNumber(row.decisions_total)} قرار ·{" "}
              {arabicNumber(row.actions_total)} Action
            </p>
          </div>
          <p className="mt-1 text-[9px] xl:mt-0">
            {arabicNumber(row.meetings)}
          </p>
          <p className="mt-1 text-[9px] text-warning xl:mt-0">
            {arabicNumber(row.decisions_deferred)}
          </p>
          <p
            className={
              row.repeated_deferred_sources
                ? "mt-1 text-[9px] text-warning xl:mt-0"
                : "mt-1 text-[9px] text-muted-foreground xl:mt-0"
            }
          >
            {arabicNumber(row.repeated_deferred_sources)}
          </p>
          <p className="mt-1 text-[9px] text-warning xl:mt-0">
            {arabicNumber(row.actions_open)}
          </p>
          <p
            className={
              row.actions_overdue
                ? "mt-1 text-[9px] font-semibold text-danger xl:mt-0"
                : "mt-1 text-[9px] text-muted-foreground xl:mt-0"
            }
          >
            {arabicNumber(row.actions_overdue)}
          </p>
          <p
            className={
              row.actions_unowned
                ? "mt-1 text-[9px] text-danger xl:mt-0"
                : "mt-1 text-[9px] text-muted-foreground xl:mt-0"
            }
          >
            {arabicNumber(row.actions_unowned)}
          </p>
          <p className="mt-1 text-[9px] xl:mt-0">
            {row.median_completion_days == null
              ? "—"
              : arabicNumber(row.median_completion_days) + " يوم"}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ExecutiveGovernanceTrendsCenter({
  meetingData,
  isLoading,
}: {
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  isLoading: boolean;
}) {
  const [bottleneckMode, setBottleneckMode] = useState<
    "project" | "objective"
  >("project");

  const data = useMemo(
    () =>
      meetingData ? buildExecutiveGovernanceTrends(meetingData) : null,
    [meetingData],
  );

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-5 w-5 animate-pulse text-brand" />
          جاري تحليل Governance Trends…
        </div>
      </section>
    );
  }

  if (!data || data.finalized_meetings.length < 2) return null;

  const rows =
    bottleneckMode === "project"
      ? data.project_bottlenecks
      : data.objective_bottlenecks;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5 text-brand" />
            Executive Governance Trends & Decision Follow-through
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            مقارنة آخر{" "}
            {arabicNumber(data.period.window_size)} اجتماع/اجتماعات معتمدة
            بالعدد نفسه قبلها، مع عرض اتجاهات القرارات والتنفيذ ومصادر
            الاختناق بدون Benchmark خارجي أو Score مركب.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card px-3 py-2 text-[9px] text-muted-foreground">
          <p>
            الحالي: <strong className="text-foreground">{data.period.current_label}</strong>
          </p>
          <p className="mt-1">
            السابق: <strong className="text-foreground">{data.period.previous_label}</strong>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <TrendMetric
          label="Decision resolution"
          metric={data.summary.decision_resolution_rate}
          note="الأعلى أفضل: Decided + Rejected / جميع Outcomes."
          icon={Gavel}
        />
        <TrendMetric
          label="Deferred rate"
          metric={data.summary.deferred_rate}
          note="الأقل أفضل: Deferred / جميع Outcomes."
          icon={TrendingDown}
        />
        <TrendMetric
          label="Action completion"
          metric={data.summary.action_completion_rate}
          note="الحالة الحالية لـActions التي نشأت من اجتماعات كل نافذة."
          icon={CheckCircle2}
        />
        <TrendMetric
          label="Overdue open rate"
          metric={data.summary.overdue_open_rate}
          note="الأقل أفضل: المتأخر / جميع Actions المفتوحة حاليًا."
          icon={AlertTriangle}
        />
        <TrendMetric
          label="Unowned open rate"
          metric={data.summary.unowned_open_rate}
          note="الأقل أفضل: Actions المفتوحة حاليًا بدون Owner."
          icon={UsersRound}
        />
        <TrendMetric
          label="On-time completion"
          metric={data.summary.on_time_completion_rate}
          note="من Actions المكتملة التي لديها Due Date مسجل."
          icon={TrendingUp}
        />
        <TrendMetric
          label="Median close"
          metric={data.summary.median_completion_days}
          formatter={(value) => numeric(value, " يوم")}
          deltaSuffix=" يوم"
          note="الأقل أفضل؛ يعتمد فقط على Actions المكتملة."
          icon={Clock3}
        />
        <TrendMetric
          label="Repeated deferrals"
          metric={data.summary.repeated_deferrals_open}
          formatter={(value) => numeric(value)}
          deltaSuffix=""
          note="الأقل أفضل؛ Source Decisions مؤجلة مرتين+ وما زالت Deferred."
          icon={Gavel}
        />
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
        <strong className="text-foreground">مهم:</strong> نسب Action completion
        وOverdue الحالية هي مقارنة Cohorts بحسب اجتماع المنشأ وليست Snapshot
        تاريخية وقت كل اجتماع؛ الاجتماعات الأقدم حصلت بطبيعتها على وقت أطول
        للإغلاق. لذلك تُعرض كإشارة Follow-through وليست دليلًا سببيًا على تحسن
        أو تراجع الأداء.
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">Meeting-by-Meeting Trend</h3>
            <p className="text-[9px] text-muted-foreground">
              آخر 12 اجتماعًا معتمدًا؛ القيم التشغيلية تعكس الحالة الحالية
              للـActions المنسوبة لكل اجتماع.
            </p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[minmax(180px,1.4fr)_90px_90px_90px_90px_90px_100px] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground xl:grid">
            <span>Meeting</span>
            <span>Resolution</span>
            <span>Deferred</span>
            <span>Action close</span>
            <span>Overdue open</span>
            <span>On time</span>
            <span>Median close</span>
          </div>

          {data.meeting_trend.map((row) => (
            <div
              key={row.meeting_id}
              className="border-t border-border p-3 first:border-t-0 xl:grid xl:grid-cols-[minmax(180px,1.4fr)_90px_90px_90px_90px_90px_100px] xl:items-center xl:gap-2"
            >
              <div>
                <p className="text-xs font-semibold">{row.title}</p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  {formatDate(row.meeting_date)} ·{" "}
                  {arabicNumber(row.decisions_total)} قرار ·{" "}
                  {arabicNumber(row.actions_total)} Action
                </p>
              </div>
              <p className="mt-1 text-[9px] text-success xl:mt-0">
                {percent(row.decision_resolution_rate)}
              </p>
              <p className="mt-1 text-[9px] text-warning xl:mt-0">
                {percent(row.deferred_rate)}
              </p>
              <p className="mt-1 text-[9px] xl:mt-0">
                {percent(row.action_completion_rate)}
              </p>
              <p className="mt-1 text-[9px] text-danger xl:mt-0">
                {percent(row.overdue_open_rate)}
              </p>
              <p className="mt-1 text-[9px] text-success xl:mt-0">
                {percent(row.on_time_completion_rate)}
              </p>
              <p className="mt-1 text-[9px] xl:mt-0">
                {row.median_completion_days == null
                  ? "—"
                  : arabicNumber(row.median_completion_days) + " يوم"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-2">
            {bottleneckMode === "project" ? (
              <FolderKanban className="h-4 w-4 text-brand" />
            ) : (
              <Target className="h-4 w-4 text-brand" />
            )}
            <div>
              <h3 className="text-sm font-semibold">Governance Bottlenecks</h3>
              <p className="text-[9px] text-muted-foreground">
                الترتيب: Overdue Actions ثم Repeated Deferrals ثم Open Actions
                ثم Deferred Decisions. لا يوجد Score مخفي.
              </p>
            </div>
          </div>

          <div className="flex rounded-lg border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setBottleneckMode("project")}
              className={
                bottleneckMode === "project"
                  ? "rounded-md bg-brand px-3 py-1.5 text-[10px] font-semibold text-primary-foreground"
                  : "rounded-md px-3 py-1.5 text-[10px] text-muted-foreground"
              }
            >
              Projects
            </button>
            <button
              type="button"
              onClick={() => setBottleneckMode("objective")}
              className={
                bottleneckMode === "objective"
                  ? "rounded-md bg-brand px-3 py-1.5 text-[10px] font-semibold text-primary-foreground"
                  : "rounded-md px-3 py-1.5 text-[10px] text-muted-foreground"
              }
            >
              Objectives
            </button>
          </div>
        </div>

        <div className="mt-3">
          <BottleneckTable rows={rows} mode={bottleneckMode} />
        </div>
      </div>

      {!!data.decision_patterns.length && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">
                Source Decision Patterns
              </h3>
              <p className="text-[9px] text-muted-foreground">
                يعتمد فقط على source_decision_id الثابت، وليس تشابه عناوين
                القرارات.
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(220px,1.4fr)_90px_90px_90px_120px_130px] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground lg:grid">
              <span>Decision</span>
              <span>Appearances</span>
              <span>Deferred</span>
              <span>Resolved</span>
              <span>Latest</span>
              <span>Span</span>
            </div>

            {data.decision_patterns.slice(0, 20).map((row) => (
              <div
                key={row.source_decision_id}
                className="border-t border-border p-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_90px_90px_90px_120px_130px] lg:items-center lg:gap-2"
              >
                <div>
                  <p className="text-xs font-semibold">{row.title}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {row.project_name ?? "بدون مشروع ظاهر"}
                    {row.objective_title
                      ? " · " + row.objective_title
                      : ""}
                  </p>
                </div>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {arabicNumber(row.appearances)}
                </p>
                <p className="mt-1 text-[9px] text-warning lg:mt-0">
                  {arabicNumber(row.deferred_count)}
                </p>
                <p className="mt-1 text-[9px] text-success lg:mt-0">
                  {arabicNumber(row.decided_count + row.rejected_count)}
                </p>
                <span
                  className={
                    row.latest_outcome === "deferred"
                      ? "mt-1 inline-flex rounded-full bg-warning/10 px-2 py-1 text-[8px] text-warning lg:mt-0"
                      : "mt-1 inline-flex rounded-full bg-success/10 px-2 py-1 text-[8px] text-success lg:mt-0"
                  }
                >
                  {row.latest_outcome}
                </span>
                <p className="mt-1 text-[8px] text-muted-foreground lg:mt-0">
                  {formatDate(row.first_meeting_date)} →{" "}
                  {formatDate(row.latest_meeting_date)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

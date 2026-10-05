import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileBarChart,
  Flag,
  Gavel,
  ListChecks,
  Printer,
  ShieldAlert,
  Target,
} from "lucide-react";
import { useMemo } from "react";

import {
  buildExecutiveStrategyBoardPack,
  downloadExecutiveStrategyBoardPackCsv,
} from "@/services/strategy-board-pack.service";
import { buildExecutiveMeetingEffectiveness } from "@/services/meeting-effectiveness.service";
import { arabicNumber } from "@/lib/format";
import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectDecision, ProjectRisk } from "@/types/action-center";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  PortfolioStrategyData,
  RecoveryPlanData,
  StrategyCalendarData,
  StrategyReviewData,
} from "@/types/strategy";
import type {
  ExecutiveObjectiveAttention,
  ExecutiveStrategyBoardPack,
} from "@/types/strategy-board-pack";

const PRINT_STYLE = [
  "@media print {",
  "  body * { visibility: hidden !important; }",
  "  [data-strategy-board-pack-print],",
  "  [data-strategy-board-pack-print] * { visibility: visible !important; }",
  "  [data-strategy-board-pack-print] {",
  "    position: absolute !important;",
  "    inset: 0 auto auto 0 !important;",
  "    width: 100% !important;",
  "    margin: 0 !important;",
  "    border: 0 !important;",
  "    border-radius: 0 !important;",
  "    box-shadow: none !important;",
  "    background: white !important;",
  "    color: black !important;",
  "    print-color-adjust: exact;",
  "    -webkit-print-color-adjust: exact;",
  "  }",
  "  [data-board-pack-screen-only] { display: none !important; }",
  "  .board-pack-page-break { break-before: page; }",
  "  .board-pack-avoid-break { break-inside: avoid; }",
  "  @page { size: A4 landscape; margin: 10mm; }",
  "}",
].join("\n");

const ATTENTION_META: Record<
  ExecutiveObjectiveAttention,
  { label: string; className: string }
> = {
  intervention: { label: "يحتاج تدخل", className: "bg-danger/10 text-danger" },
  follow_up: { label: "يحتاج متابعة", className: "bg-warning/10 text-warning" },
  insufficient_data: {
    label: "بيانات غير كافية",
    className: "bg-muted text-muted-foreground",
  },
  stable: { label: "مستقر", className: "bg-success/10 text-success" },
};

const FORECAST_LABELS: Record<string, string> = {
  achieved: "متحقق",
  overdue: "متجاوز الموعد",
  projected_on_time: "متوقع في الموعد",
  projected_late: "متوقع متأخرًا",
  stalled: "Trend متوقف",
  insufficient_data: "بيانات غير كافية",
};

const BENEFIT_STATUS: Record<string, string> = {
  planned: "مخطط",
  realizing: "قيد التحقق",
  realized: "متحقق",
  not_realized: "لم يتحقق",
};

const EVENT_LABELS: Record<string, string> = {
  strategy_review: "Strategy Review",
  kr_update: "KR Update",
  benefit_review: "Benefit Review",
  recovery_checkpoint: "Recovery Checkpoint",
  recovery_commitment: "Recovery Commitment",
};

function todayKeyLocal() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date =
    value.length === 10
      ? new Date(value + "T12:00:00Z")
      : new Date(value);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  }).format(date);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
  }).format(new Date(value));
}

function percent(value: number | null) {
  return value == null ? "—" : Math.round(value) + "%";
}

function SummaryMetric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="board-pack-avoid-break rounded-xl border border-border bg-background p-3">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={"mt-1 text-xl font-semibold " + tone}>{value}</p>
    </div>
  );
}

function BoardPackContents({
  pack,
  meetingEffectiveness,
}: {
  pack: ExecutiveStrategyBoardPack;
  meetingEffectiveness: ReturnType<typeof buildExecutiveMeetingEffectiveness> | null;
}) {
  const today = todayKeyLocal();
  const projectMap = new Map(
    pack.projects.map((project) => [project.id, project] as const),
  );
  const objectiveMap = new Map(
    pack.objectives.map((row) => [row.objective.id, row.objective] as const),
  );

  return (
    <>
      <section className="board-pack-avoid-break border-b border-border p-4 md:p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Executive Strategy Board Pack
        </p>
        <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <FileBarChart className="h-5 w-5 text-brand" />
              حزمة المراجعة التنفيذية للاستراتيجية
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              وضع الاستراتيجية الحالي، القرارات المطلوبة، المخاطر، Benefits،
              Recovery Plans والأجندة القادمة — مبني مباشرة من بيانات النظام الحالية.
            </p>
          </div>
          <p className="text-[9px] text-muted-foreground">
            تم التجميع {formatTimestamp(pack.generated_at)}
          </p>
        </div>
      </section>

      <section className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <SummaryMetric label="Objectives" value={arabicNumber(pack.summary.objectives_total)} />
        <SummaryMetric
          label="تحتاج تدخل"
          value={arabicNumber(pack.summary.objectives_intervention)}
          tone="text-danger"
        />
        <SummaryMetric
          label="تحتاج متابعة"
          value={arabicNumber(pack.summary.objectives_follow_up)}
          tone="text-warning"
        />
        <SummaryMetric
          label="Forecast متأخر/متوقف"
          value={arabicNumber(pack.summary.projected_late_or_overdue)}
          tone="text-warning"
        />
        <SummaryMetric
          label="Benefits متحققة"
          value={
            arabicNumber(pack.summary.benefits_realized) +
            "/" +
            arabicNumber(pack.summary.benefits_total)
          }
          tone="text-success"
        />
        <SummaryMetric
          label="مخاطر High/Critical"
          value={arabicNumber(pack.summary.critical_high_risks)}
          tone="text-danger"
        />
        <SummaryMetric
          label="قرارات مطلوبة"
          value={arabicNumber(pack.decisions_required.length)}
          tone="text-info"
        />
        <SummaryMetric
          label="مواعيد متأخرة"
          value={arabicNumber(pack.summary.calendar_overdue)}
          tone="text-danger"
        />
      </section>

      <section className="board-pack-avoid-break border-b border-border p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric
            label="Portfolio delivery progress"
            value={pack.summary.execution_average_progress + "%"}
          />
          <SummaryMetric
            label="عناصر تنفيذ مكتملة"
            value={
              arabicNumber(pack.summary.execution_completed) +
              "/" +
              arabicNumber(pack.summary.execution_total)
            }
            tone="text-success"
          />
          <SummaryMetric
            label="عناصر تنفيذ متأخرة"
            value={arabicNumber(pack.summary.execution_overdue)}
            tone="text-danger"
          />
          <SummaryMetric
            label="عناصر تنفيذ معطلة"
            value={arabicNumber(pack.summary.execution_blocked)}
            tone="text-warning"
          />
        </div>
      </section>

      <section className="border-b border-border p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">Objective Scorecard</h3>
            <p className="text-[9px] text-muted-foreground">
              لا توجد درجة مركبة؛ حالة كل Objective مبنية على إشارات ظاهرة ومذكورة.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_90px_110px_90px_90px_90px_110px_minmax(180px,1fr)] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground xl:grid">
            <span>Objective</span>
            <span>Progress</span>
            <span>Forecast</span>
            <span>Benefits</span>
            <span>Risks</span>
            <span>Decisions</span>
            <span>Recovery</span>
            <span>Next / Reason</span>
          </div>

          {pack.objectives.map((row) => {
            const meta = ATTENTION_META[row.attention];
            return (
              <div
                key={row.objective.id}
                className="board-pack-avoid-break border-t border-border p-3 first:border-t-0 xl:grid xl:grid-cols-[minmax(220px,1.4fr)_90px_110px_90px_90px_90px_110px_minmax(180px,1fr)] xl:items-start xl:gap-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-xs font-semibold">
                      {row.objective.title}
                    </p>
                    <span className={"rounded-full px-2 py-0.5 text-[8px] " + meta.className}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[8px] text-muted-foreground">
                    {row.objective.owner_name ?? "بدون مالك"}
                    {row.objective.due_date
                      ? " · " + formatDate(row.objective.due_date)
                      : ""}
                  </p>
                </div>

                <p className="mt-2 text-xs font-semibold xl:mt-0">
                  {percent(row.forecast.latest_progress)}
                </p>

                <p className="mt-1 text-[9px] xl:mt-0">
                  {FORECAST_LABELS[row.forecast.status] ?? row.forecast.status}
                  {row.forecast.projected_completion_date && (
                    <span className="mt-0.5 block text-[8px] text-muted-foreground">
                      {formatDate(row.forecast.projected_completion_date)}
                    </span>
                  )}
                </p>

                <p className="mt-1 text-[9px] xl:mt-0">
                  {row.benefits_realized}/{row.benefits_total}
                  {row.benefits_overdue > 0 && (
                    <span className="block text-[8px] text-danger">
                      {row.benefits_overdue} متأخرة
                    </span>
                  )}
                </p>

                <p className="mt-1 text-[9px] xl:mt-0">
                  {row.active_risks}
                  {row.critical_high_risks > 0 && (
                    <span className="block text-[8px] text-danger">
                      {row.critical_high_risks} High/Critical
                    </span>
                  )}
                </p>

                <p className="mt-1 text-[9px] xl:mt-0">{row.pending_decisions}</p>

                <p className="mt-1 text-[9px] xl:mt-0">
                  {row.active_recovery_plans
                    ? row.active_recovery_plans + " خطة نشطة"
                    : "—"}
                  {row.overdue_recovery_commitments > 0 && (
                    <span className="block text-[8px] text-danger">
                      {row.overdue_recovery_commitments} التزام متأخر
                    </span>
                  )}
                </p>

                <div className="mt-1 text-[8px] leading-4 text-muted-foreground xl:mt-0">
                  {row.next_event && (
                    <p>
                      التالي: {row.next_event.title} · {formatDate(row.next_event.due_date)}
                    </p>
                  )}
                  <p className="mt-1">{row.attention_reasons.join(" ")}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {meetingEffectiveness &&
        meetingEffectiveness.summary.finalized_meetings > 0 && (
          <section className="board-pack-avoid-break border-b border-border p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Gavel className="h-4 w-4 text-brand" />
              <div>
                <h3 className="text-sm font-semibold">
                  Meeting Effectiveness & Follow-through
                </h3>
                <p className="text-[9px] text-muted-foreground">
                  قياسات مباشرة من Outcomes وAction Items المسجلة، بدون Score مركب.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <SummaryMetric
                label="Finalized meetings"
                value={arabicNumber(
                  meetingEffectiveness.summary.finalized_meetings,
                )}
              />
              <SummaryMetric
                label="Decision resolution"
                value={
                  meetingEffectiveness.summary.decision_resolution_rate == null
                    ? "—"
                    : arabicNumber(
                        meetingEffectiveness.summary.decision_resolution_rate,
                      ) + "%"
                }
                tone="text-success"
              />
              <SummaryMetric
                label="Action completion"
                value={
                  meetingEffectiveness.summary.action_completion_rate == null
                    ? "—"
                    : arabicNumber(
                        meetingEffectiveness.summary.action_completion_rate,
                      ) + "%"
                }
                tone="text-success"
              />
              <SummaryMetric
                label="Repeated deferrals"
                value={arabicNumber(
                  meetingEffectiveness.summary.unresolved_repeated_deferrals,
                )}
                tone="text-warning"
              />
              <SummaryMetric
                label="Open actions"
                value={arabicNumber(
                  meetingEffectiveness.summary.actions_open,
                )}
                tone="text-warning"
              />
              <SummaryMetric
                label="Overdue actions"
                value={arabicNumber(
                  meetingEffectiveness.summary.actions_overdue,
                )}
                tone="text-danger"
              />
              <SummaryMetric
                label="Median close"
                value={
                  meetingEffectiveness.summary.median_completion_days == null
                    ? "—"
                    : arabicNumber(
                        meetingEffectiveness.summary.median_completion_days,
                      ) + " يوم"
                }
                tone="text-info"
              />
              <SummaryMetric
                label="Max carryover"
                value={
                  arabicNumber(
                    meetingEffectiveness.summary.max_carryover_meetings,
                  ) + " اجتماع"
                }
                tone="text-warning"
              />
            </div>
          </section>
        )}

      <section className="board-pack-page-break grid gap-4 border-b border-border p-4 md:p-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <div>
              <h3 className="text-sm font-semibold">Decisions Required</h3>
              <p className="text-[9px] text-muted-foreground">
                Decision Log المقترح + القرارات المطلوبة في أحدث Strategy Review.
              </p>
            </div>
          </div>

          {!pack.decisions_required.length ? (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-xs text-success">
              لا توجد قرارات معلقة مسجلة حاليًا.
            </div>
          ) : (
            <div className="space-y-2">
              {pack.decisions_required.slice(0, 12).map((decision) => (
                <div
                  key={decision.id}
                  className="board-pack-avoid-break rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{decision.title}</p>
                    <span className="rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info">
                      {decision.source === "decision_log"
                        ? "Decision Log"
                        : "Strategy Review"}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                    {decision.detail}
                  </p>
                  <p className="mt-2 text-[8px] text-muted-foreground">
                    {decision.objective_title ?? "بدون Objective مباشر"}
                    {decision.project_name ? " · " + decision.project_name : ""}
                    {decision.owner_name ? " · " + decision.owner_name : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-danger" />
            <div>
              <h3 className="text-sm font-semibold">Strategic Risks</h3>
              <p className="text-[9px] text-muted-foreground">
                المخاطر المفتوحة أو قيد المعالجة، مرتبة حسب Severity ثم Due Date.
              </p>
            </div>
          </div>

          {!pack.top_risks.length ? (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-xs text-success">
              لا توجد مخاطر مفتوحة أو قيد المعالجة.
            </div>
          ) : (
            <div className="space-y-2">
              {pack.top_risks.slice(0, 12).map(({ risk, objective_titles }) => (
                <div
                  key={risk.id}
                  className="board-pack-avoid-break rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{risk.title}</p>
                    <span
                      className={
                        risk.severity === "critical"
                          ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                          : risk.severity === "high"
                            ? "rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning"
                            : "rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
                      }
                    >
                      {risk.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {risk.owner_name ?? "بدون مسؤول"}
                    {risk.due_date ? " · " + formatDate(risk.due_date) : ""}
                  </p>
                  {objective_titles.length > 0 && (
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      Objectives: {objective_titles.join("، ")}
                    </p>
                  )}
                  {(risk.mitigation || risk.description) && (
                    <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                      {risk.mitigation ?? risk.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 border-b border-border p-4 md:p-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Benefits Realization</h3>
          </div>

          {!pack.benefits.length ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
              لا توجد Benefits مسجلة.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {pack.benefits.slice(0, 14).map((benefit) => (
                <div
                  key={benefit.id}
                  className="board-pack-avoid-break border-t border-border p-3 first:border-t-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-xs font-semibold">{benefit.title}</p>
                    <span
                      className={
                        benefit.status === "realized"
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                          : benefit.status === "not_realized"
                            ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                            : "rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
                      }
                    >
                      {BENEFIT_STATUS[benefit.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {objectiveMap.get(benefit.objective_id)?.title ?? "Objective"}
                    {benefit.owner_name ? " · " + benefit.owner_name : ""}
                    {benefit.target_date ? " · Target " + formatDate(benefit.target_date) : ""}
                  </p>
                  {(benefit.realized_outcome || benefit.expected_outcome) && (
                    <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                      {benefit.realized_outcome ?? benefit.expected_outcome}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <Flag className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">Recovery Oversight</h3>
          </div>

          {!pack.active_recovery_plans.length ? (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-xs text-success">
              لا توجد Recovery Plans نشطة.
            </div>
          ) : (
            <div className="space-y-2">
              {pack.active_recovery_plans.slice(0, 10).map((plan) => {
                const openCommitments = plan.commitments.filter(
                  (row) => row.status === "open" || row.status === "in_progress",
                );
                const done = plan.commitments.filter((row) => row.status === "done").length;
                return (
                  <div
                    key={plan.id}
                    className="board-pack-avoid-break rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-xs font-semibold">{plan.title}</p>
                      <span className="rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info">
                        Active
                      </span>
                    </div>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      {objectiveMap.get(plan.objective_id)?.title ?? "Objective"}
                      {plan.owner_name ? " · " + plan.owner_name : ""}
                      {plan.target_recovery_date
                        ? " · Target " + formatDate(plan.target_recovery_date)
                        : ""}
                    </p>
                    <p className="mt-2 text-[9px] text-muted-foreground">
                      Commitments: {done} مكتمل · {openCommitments.length} مفتوح
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="board-pack-page-break grid gap-4 border-b border-border p-4 md:p-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Gavel className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Latest Meeting Outcomes</h3>
              <p className="text-[9px] text-muted-foreground">
                آخر اجتماع معتمد والقرارات الناتجة عنه.
              </p>
            </div>
          </div>

          {!pack.latest_completed_meeting ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
              لا يوجد محضر اجتماع تنفيذي معتمد بعد.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold">
                  {pack.latest_completed_meeting.title}
                </p>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success">
                  Finalized
                </span>
              </div>
              <p className="mt-1 text-[8px] text-muted-foreground">
                {formatDate(pack.latest_completed_meeting.meeting_date)}
                {pack.latest_completed_meeting.chair_name
                  ? " · " + pack.latest_completed_meeting.chair_name
                  : ""}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px]">
                <div className="rounded-lg bg-success/5 p-2">
                  <strong className="text-success">
                    {
                      pack.latest_completed_meeting.decisions.filter(
                        (row) => row.outcome === "decided",
                      ).length
                    }
                  </strong>
                  <p className="text-muted-foreground">Decided</p>
                </div>
                <div className="rounded-lg bg-warning/5 p-2">
                  <strong className="text-warning">
                    {
                      pack.latest_completed_meeting.decisions.filter(
                        (row) => row.outcome === "deferred",
                      ).length
                    }
                  </strong>
                  <p className="text-muted-foreground">Deferred</p>
                </div>
                <div className="rounded-lg bg-info/5 p-2">
                  <strong className="text-info">
                    {
                      pack.latest_completed_meeting.action_items.filter(
                        (row) =>
                          row.status === "open" ||
                          row.status === "in_progress",
                      ).length
                    }
                  </strong>
                  <p className="text-muted-foreground">Open Actions</p>
                </div>
              </div>
              {pack.latest_completed_meeting.summary && (
                <p className="mt-3 text-[9px] leading-4 text-muted-foreground">
                  {pack.latest_completed_meeting.summary}
                </p>
              )}
              {pack.latest_completed_meeting.next_meeting_date && (
                <p className="mt-2 text-[8px] text-muted-foreground">
                  الاجتماع التالي:{" "}
                  {formatDate(pack.latest_completed_meeting.next_meeting_date)}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-warning" />
            <div>
              <h3 className="text-sm font-semibold">Meeting Carryover</h3>
              <p className="text-[9px] text-muted-foreground">
                Action Items غير المغلقة من الاجتماعات السابقة.
              </p>
            </div>
          </div>

          {!pack.open_meeting_actions.length ? (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-xs text-success">
              لا توجد Action Items مرحّلة.
            </div>
          ) : (
            <div className="space-y-2">
              {pack.open_meeting_actions.slice(0, 12).map((action) => (
                <div
                  key={action.id}
                  className="board-pack-avoid-break rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-xs font-semibold">
                      {action.title}
                    </p>
                    <span
                      className={
                        action.due_date &&
                        action.due_date < today
                          ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                          : "rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning"
                      }
                    >
                      {action.status === "in_progress" ? "In Progress" : "Open"}
                    </span>
                  </div>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {action.owner_name ?? "بدون مسؤول"}
                    {action.objective_title
                      ? " · " + action.objective_title
                      : ""}
                    {action.project_name ? " · " + action.project_name : ""}
                    {action.due_date
                      ? " · Due " + formatDate(action.due_date)
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">Next 30 Days Agenda</h3>
            <p className="text-[9px] text-muted-foreground">
              تشمل كذلك العناصر المتأخرة التي لم تُغلق بعد.
            </p>
          </div>
        </div>

        {!pack.upcoming_agenda.length ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            لا توجد عناصر Agenda ضمن النافذة الحالية.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            {pack.upcoming_agenda.slice(0, 20).map((event) => (
              <div
                key={event.event_type + ":" + event.source_id + ":" + event.due_date}
                className="board-pack-avoid-break flex flex-col gap-2 border-t border-border p-3 first:border-t-0 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{event.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </span>
                    <span
                      className={
                        event.status === "overdue"
                          ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                          : event.status === "due_soon"
                            ? "rounded-full bg-warning/10 px-2 py-0.5 text-[8px] text-warning"
                            : "rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info"
                      }
                    >
                      {event.status === "overdue"
                        ? "Overdue"
                        : event.status === "due_soon"
                          ? "Due Soon"
                          : "Upcoming"}
                    </span>
                  </div>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {event.objective_title}
                    {event.project_id && projectMap.get(event.project_id)
                      ? " · " + projectMap.get(event.project_id)!.name
                      : ""}
                  </p>
                </div>
                <p
                  className={
                    event.status === "overdue"
                      ? "text-xs font-semibold text-danger"
                      : "text-xs font-semibold"
                  }
                >
                  {formatDate(event.due_date)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border p-4 text-[8px] leading-4 text-muted-foreground">
        <strong className="text-foreground">منهج التقرير:</strong> لا يستخدم
        Score مخفيًا أو Probability مولدة. حالة التدخل/المتابعة مشتقة من Forecast
        المعلن، المخاطر High/Critical، القرارات المعلقة، Benefits المتأخرة،
        Recovery Commitments والمواعيد الاستراتيجية المتأخرة.
      </footer>
    </>
  );
}

export function ExecutiveStrategyBoardPack({
  strategy,
  reviewData,
  recoveryData,
  calendarData,
  risks,
  decisions,
  projects,
  boards,
  execution,
  meetingData,
  isLoading,
}: {
  strategy: PortfolioStrategyData | undefined;
  reviewData: StrategyReviewData | undefined;
  recoveryData: RecoveryPlanData | undefined;
  calendarData: StrategyCalendarData | undefined;
  risks: ProjectRisk[];
  decisions: ProjectDecision[];
  projects: Project[];
  boards: BoardWithContext[];
  execution: ProjectExecutionSummary | undefined;
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  isLoading: boolean;
}) {
  const pack = useMemo(
    () =>
      strategy && reviewData && recoveryData && calendarData && meetingData
        ? buildExecutiveStrategyBoardPack({
            strategy,
            reviews: reviewData,
            recovery: recoveryData,
            calendar: calendarData,
            risks,
            decisions,
            projects,
            boards,
            execution: execution ?? null,
            meetings: meetingData,
          })
        : null,
    [
      strategy,
      reviewData,
      recoveryData,
      calendarData,
      risks,
      decisions,
      projects,
      boards,
      execution,
      meetingData,
    ],
  );

  const meetingEffectiveness = useMemo(
    () =>
      meetingData ? buildExecutiveMeetingEffectiveness(meetingData) : null,
    [meetingData],
  );

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileBarChart className="h-5 w-5 animate-pulse text-brand" />
          جاري تجميع Executive Strategy Board Pack…
        </div>
      </section>
    );
  }

  if (!pack || !strategy?.objectives.length) return null;

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <section
        data-strategy-board-pack-print
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]"
      >
        <div
          data-board-pack-screen-only
          className="flex flex-col gap-3 border-b border-border bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold">
              Executive Strategy Scorecard & Board Pack
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              نسخة حية من البيانات الحالية؛ أعد الطباعة أو التصدير بعد أي تحديث.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadExecutiveStrategyBoardPackCsv(pack)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              تصدير CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Printer className="h-4 w-4" />
              طباعة Board Pack
            </button>
          </div>
        </div>

        <BoardPackContents
          pack={pack}
          meetingEffectiveness={meetingEffectiveness}
        />
      </section>
    </>
  );
}

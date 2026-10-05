import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gavel,
  History,
  ListChecks,
  RotateCcw,
  UserX,
} from "lucide-react";
import { useMemo } from "react";

import { arabicNumber } from "@/lib/format";
import { buildExecutiveMeetingEffectiveness } from "@/services/meeting-effectiveness.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type { MeetingEffectivenessSummary } from "@/types/meeting-effectiveness";

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

function Metric({
  label,
  value,
  tone = "",
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
  icon: typeof Gavel;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div className="flex items-center gap-2">
        <Icon className={"h-4 w-4 " + tone} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={"mt-2 text-xl font-bold " + tone}>{value}</p>
      {note && (
        <p className="mt-1 text-[8px] leading-4 text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

function percent(value: number | null) {
  return value == null ? "—" : arabicNumber(value) + "%";
}

function summaryMetrics(summary: MeetingEffectivenessSummary) {
  return [
    {
      label: "Decision resolution",
      value: percent(summary.decision_resolution_rate),
      tone: "text-success",
      note:
        arabicNumber(summary.decisions_resolved) +
        " resolved من " +
        arabicNumber(summary.decisions_total),
      icon: Gavel,
    },
    {
      label: "Action completion",
      value: percent(summary.action_completion_rate),
      tone: "text-success",
      note:
        arabicNumber(summary.actions_done) +
        " done من " +
        arabicNumber(summary.actions_total),
      icon: CheckCircle2,
    },
    {
      label: "تأجيل متكرر",
      value: arabicNumber(summary.unresolved_repeated_deferrals),
      tone:
        summary.unresolved_repeated_deferrals > 0
          ? "text-warning"
          : "text-success",
      note: "Source Decisions مؤجلة مرتين+ وما زالت غير محسومة",
      icon: RotateCcw,
    },
    {
      label: "Actions متأخرة",
      value: arabicNumber(summary.actions_overdue),
      tone: summary.actions_overdue > 0 ? "text-danger" : "text-success",
      note:
        arabicNumber(summary.actions_open) +
        " Action Items ما زالت مفتوحة",
      icon: AlertTriangle,
    },
    {
      label: "بدون مسؤول",
      value: arabicNumber(summary.actions_unowned),
      tone: summary.actions_unowned > 0 ? "text-danger" : "text-success",
      note: "Action Items مفتوحة فقط",
      icon: UserX,
    },
    {
      label: "Median الإغلاق",
      value:
        summary.median_completion_days == null
          ? "—"
          : arabicNumber(summary.median_completion_days) + " يوم",
      tone: "text-info",
      note: "من Created At إلى Completed At للـActions المكتملة",
      icon: Clock3,
    },
    {
      label: "أقدم Carryover",
      value:
        summary.oldest_open_action_days == null
          ? "—"
          : arabicNumber(summary.oldest_open_action_days) + " يوم",
      tone:
        (summary.oldest_open_action_days ?? 0) > 0
          ? "text-warning"
          : "text-success",
      note:
        "أقصى عبور: " +
        arabicNumber(summary.max_carryover_meetings) +
        " اجتماع لاحق",
      icon: History,
    },
    {
      label: "إغلاق متأخر",
      value: arabicNumber(summary.late_completed_actions),
      tone:
        summary.late_completed_actions > 0
          ? "text-warning"
          : "text-success",
      note: "Actions أُغلقت بعد Due Date المسجل",
      icon: CalendarClock,
    },
  ] as const;
}

export function ExecutiveMeetingEffectivenessCenter({
  meetingData,
  isLoading,
}: {
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  isLoading: boolean;
}) {
  const data = useMemo(
    () =>
      meetingData
        ? buildExecutiveMeetingEffectiveness(meetingData)
        : null,
    [meetingData],
  );

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-5 w-5 animate-pulse text-brand" />
          جاري تحليل Effectiveness وFollow-through…
        </div>
      </section>
    );
  }

  if (!data || data.summary.finalized_meetings === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5 text-brand" />
          Meeting Effectiveness & Decision Follow-through
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          تحليل تاريخي مباشر من الاجتماعات النهائية وAction Items المسجلة، بدون
          Score مركب أو مطابقة نصية تخمينية.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {summaryMetrics(data.summary).map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </div>

      {!!data.repeated_deferrals.length && (
        <div className="rounded-2xl border border-warning/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-warning" />
            <div>
              <h3 className="text-sm font-semibold">
                قرارات تتكرر في التأجيل
              </h3>
              <p className="text-[9px] text-muted-foreground">
                يظهر القرار هنا فقط إذا كان له Source Decision ثابت وتم تسجيل
                Deferred مرتين أو أكثر عبر اجتماعات معتمدة.
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(220px,1.4fr)_90px_90px_120px_120px_minmax(150px,1fr)] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground lg:grid">
              <span>القرار</span>
              <span>Deferrals</span>
              <span>Appearances</span>
              <span>أول اجتماع</span>
              <span>آخر اجتماع</span>
              <span>الحالة الحالية</span>
            </div>

            {data.repeated_deferrals.slice(0, 20).map((row) => (
              <div
                key={row.source_decision_id}
                className="border-t border-border p-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_90px_90px_120px_120px_minmax(150px,1fr)] lg:items-center lg:gap-2"
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
                <p className="mt-1 text-[10px] text-warning lg:mt-0">
                  {arabicNumber(row.deferral_count)}
                </p>
                <p className="mt-1 text-[10px] lg:mt-0">
                  {arabicNumber(row.total_appearances)}
                </p>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {formatDate(row.first_meeting_date)}
                </p>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {formatDate(row.latest_meeting_date)}
                </p>
                <span
                  className={
                    row.still_unresolved
                      ? "mt-1 inline-flex rounded-full bg-warning/10 px-2 py-1 text-[8px] text-warning lg:mt-0"
                      : "mt-1 inline-flex rounded-full bg-success/10 px-2 py-1 text-[8px] text-success lg:mt-0"
                  }
                >
                  {row.still_unresolved
                    ? "ما زال Deferred"
                    : "تم حسمه لاحقًا"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!data.open_follow_through.length && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">
                Open Action Follow-through
              </h3>
              <p className="text-[9px] text-muted-foreground">
                مرتب حسب التأخير ثم عدد الاجتماعات اللاحقة ثم عمر Action Item.
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(220px,1.4fr)_130px_90px_90px_100px_120px] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground lg:grid">
              <span>Action Item</span>
              <span>Owner</span>
              <span>العمر</span>
              <span>Carryover</span>
              <span>Due Date</span>
              <span>الحالة</span>
            </div>

            {data.open_follow_through.slice(0, 25).map((row) => (
              <div
                key={row.action.id}
                className="border-t border-border p-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_130px_90px_90px_100px_120px] lg:items-center lg:gap-2"
              >
                <div>
                  <p className="text-xs font-semibold">{row.action.title}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {row.origin_meeting.title} ·{" "}
                    {formatDate(row.origin_meeting.meeting_date)}
                  </p>
                </div>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {row.action.owner_name ?? "بدون مسؤول"}
                </p>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {arabicNumber(row.age_days)} يوم
                </p>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {arabicNumber(row.carryover_meetings)} اجتماع
                </p>
                <p className="mt-1 text-[9px] lg:mt-0">
                  {formatDate(row.action.due_date)}
                </p>
                <span
                  className={
                    row.overdue
                      ? "mt-1 inline-flex rounded-full bg-danger/10 px-2 py-1 text-[8px] text-danger lg:mt-0"
                      : "mt-1 inline-flex rounded-full bg-warning/10 px-2 py-1 text-[8px] text-warning lg:mt-0"
                  }
                >
                  {row.overdue
                    ? "Overdue"
                    : row.action.status === "in_progress"
                      ? "In Progress"
                      : "Open"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">
              Follow-through by Meeting
            </h3>
            <p className="text-[9px] text-muted-foreground">
              نتيجة كل اجتماع كما هي مسجلة: قراراته وAction Items الناتجة عنه.
            </p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_90px_90px_90px_90px_90px_100px] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground lg:grid">
            <span>Meeting</span>
            <span>Decided</span>
            <span>Deferred</span>
            <span>Actions</span>
            <span>Done</span>
            <span>Overdue</span>
            <span>Closure</span>
          </div>

          {data.meeting_outcomes.slice(0, 20).map((row) => (
            <div
              key={row.meeting.id}
              className="border-t border-border p-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_90px_90px_90px_90px_90px_100px] lg:items-center lg:gap-2"
            >
              <div>
                <p className="text-xs font-semibold">{row.meeting.title}</p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  {formatDate(row.meeting.meeting_date)}
                </p>
              </div>
              <p className="mt-1 text-[10px] text-success lg:mt-0">
                {arabicNumber(row.decisions_decided)}
              </p>
              <p className="mt-1 text-[10px] text-warning lg:mt-0">
                {arabicNumber(row.decisions_deferred)}
              </p>
              <p className="mt-1 text-[10px] lg:mt-0">
                {arabicNumber(row.actions_total)}
              </p>
              <p className="mt-1 text-[10px] text-success lg:mt-0">
                {arabicNumber(row.actions_done)}
              </p>
              <p className="mt-1 text-[10px] text-danger lg:mt-0">
                {arabicNumber(row.actions_overdue)}
              </p>
              <p className="mt-1 text-[10px] lg:mt-0">
                {row.action_completion_rate == null
                  ? "—"
                  : arabicNumber(row.action_completion_rate) + "%"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
        <strong className="text-foreground">منهج القياس:</strong> Decision
        resolution = Decided + Rejected من Outcomes المسجلة. Action completion =
        Done / جميع Actions غير الملغاة. Median الإغلاق يعتمد فقط على Actions
        التي تحتوي Completed At. Carryover Meetings هو عدد الاجتماعات المعتمدة
        اللاحقة لاجتماع منشأ Action Item.
      </div>
    </section>
  );
}

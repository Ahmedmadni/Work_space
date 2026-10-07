import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Gauge,
  History,
  Save,
  Settings2,
  Target,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useSaveExecutiveGovernanceTargets } from "@/hooks/use-governance-targets";
import { arabicNumber } from "@/lib/format";
import { buildExecutiveGovernanceTrends } from "@/services/governance-trends.service";
import { evaluateExecutiveGovernanceTargets } from "@/services/governance-targets.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  ExecutiveGovernanceTargetProfile,
  ExecutiveGovernanceTargetsData,
  GovernanceCadenceStatus,
  GovernanceTargetAssessment,
  GovernanceTargetStatus,
} from "@/types/governance-targets";

interface TargetDraft {
  decision_resolution_target_pct: string;
  max_deferred_rate_pct: string;
  action_completion_target_pct: string;
  max_overdue_open_rate_pct: string;
  max_unowned_open_rate_pct: string;
  on_time_completion_target_pct: string;
  max_median_completion_days: string;
  max_repeated_deferrals: string;
  meeting_cadence_days: string;
  cadence_warning_days_before: string;
}

const STATUS_META: Record<
  GovernanceTargetStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  met: {
    label: "Met",
    className: "bg-success/10 text-success",
    icon: CheckCircle2,
  },
  not_met: {
    label: "Not Met",
    className: "bg-danger/10 text-danger",
    icon: XCircle,
  },
  no_target: {
    label: "No Target",
    className: "bg-muted text-muted-foreground",
    icon: CircleHelp,
  },
  insufficient_data: {
    label: "Insufficient Data",
    className: "bg-info/10 text-info",
    icon: CircleHelp,
  },
};

const RHYTHM_META: Record<
  GovernanceCadenceStatus,
  { label: string; className: string }
> = {
  on_schedule: {
    label: "On Schedule",
    className: "bg-success/10 text-success",
  },
  due_soon: {
    label: "Due Soon",
    className: "bg-warning/10 text-warning",
  },
  overdue: {
    label: "Overdue",
    className: "bg-danger/10 text-danger",
  },
  no_target: {
    label: "No Cadence Target",
    className: "bg-muted text-muted-foreground",
  },
  no_meetings: {
    label: "No Finalized Meetings",
    className: "bg-info/10 text-info",
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

function profileDraft(
  profile: ExecutiveGovernanceTargetProfile | null,
): TargetDraft {
  const text = (value: number | null | undefined) =>
    value == null ? "" : String(value);

  return {
    decision_resolution_target_pct: text(
      profile?.decision_resolution_target_pct,
    ),
    max_deferred_rate_pct: text(profile?.max_deferred_rate_pct),
    action_completion_target_pct: text(
      profile?.action_completion_target_pct,
    ),
    max_overdue_open_rate_pct: text(
      profile?.max_overdue_open_rate_pct,
    ),
    max_unowned_open_rate_pct: text(
      profile?.max_unowned_open_rate_pct,
    ),
    on_time_completion_target_pct: text(
      profile?.on_time_completion_target_pct,
    ),
    max_median_completion_days: text(
      profile?.max_median_completion_days,
    ),
    max_repeated_deferrals: text(profile?.max_repeated_deferrals),
    meeting_cadence_days: text(profile?.meeting_cadence_days),
    cadence_warning_days_before: text(
      profile?.cadence_warning_days_before,
    ),
  };
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(value: string) {
  const parsed = nullableNumber(value);
  if (parsed == null) return null;
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function formatAssessmentValue(
  value: number | null,
  unit: GovernanceTargetAssessment["unit"],
) {
  if (value == null) return "—";
  if (unit === "%") return arabicNumber(value) + "%";
  if (unit === "days") return arabicNumber(value) + " يوم";
  return arabicNumber(value);
}

function operatorText(assessment: GovernanceTargetAssessment) {
  return assessment.operator === "gte" ? "≥" : "≤";
}

function TargetAssessmentCard({
  assessment,
}: {
  assessment: GovernanceTargetAssessment;
}) {
  const meta = STATUS_META[assessment.status];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">{assessment.label}</p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            Target {operatorText(assessment)}{" "}
            {formatAssessmentValue(assessment.target, assessment.unit)}
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] " +
            meta.className
          }
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[8px] text-muted-foreground">Actual</p>
          <p className="mt-0.5 text-lg font-semibold">
            {formatAssessmentValue(assessment.actual, assessment.unit)}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[8px] text-muted-foreground">Gap to target</p>
          <p
            className={
              assessment.status === "met"
                ? "mt-0.5 text-sm font-semibold text-success"
                : assessment.status === "not_met"
                  ? "mt-0.5 text-sm font-semibold text-danger"
                  : "mt-0.5 text-sm font-semibold text-muted-foreground"
            }
          >
            {assessment.gap == null
              ? "—"
              : (assessment.gap > 0 ? "+" : "") +
                formatAssessmentValue(
                  assessment.gap,
                  assessment.unit,
                )}
          </p>
        </div>
      </div>
    </div>
  );
}

function TargetInput({
  label,
  hint,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="text-[10px] text-muted-foreground">
      {label}
      <div className="mt-1 flex overflow-hidden rounded-lg border border-border bg-background">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          placeholder="بدون Target"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-foreground outline-none"
        />
        <span className="flex items-center border-s border-border bg-muted/20 px-2 text-[9px]">
          {suffix}
        </span>
      </div>
      <span className="mt-1 block text-[8px] leading-4">{hint}</span>
    </label>
  );
}

export function ExecutiveGovernanceTargetsCenter({
  targetData,
  meetingData,
  isLoading,
}: {
  targetData: ExecutiveGovernanceTargetsData | undefined;
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  isLoading: boolean;
}) {
  const save = useSaveExecutiveGovernanceTargets();
  const profile = targetData?.profile ?? null;
  const [draft, setDraft] = useState<TargetDraft>(() =>
    profileDraft(profile),
  );

  useEffect(() => {
    setDraft(profileDraft(profile));
  }, [profile]);

  const trends = useMemo(
    () =>
      meetingData ? buildExecutiveGovernanceTrends(meetingData) : null,
    [meetingData],
  );

  const evaluation = useMemo(
    () =>
      targetData && meetingData && trends
        ? evaluateExecutiveGovernanceTargets(
            targetData,
            trends,
            meetingData,
          )
        : null,
    [targetData, trends, meetingData],
  );

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل Governance Targets…
        </div>
      </section>
    );
  }

  if (!targetData || !meetingData || !trends || !evaluation) return null;

  const rhythmMeta = RHYTHM_META[evaluation.rhythm.status];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-5 w-5 text-brand" />
            Executive Governance Targets & Operating Rhythm
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            أهداف داخلية تحددها الإدارة بنفسها؛ لا توجد Benchmarks افتراضية.
            المقارنة تستخدم آخر نافذة اجتماعات فعلية من Governance Trends.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card px-3 py-2 text-[9px] text-muted-foreground">
          <p>
            Version:{" "}
            <strong className="text-foreground">
              {profile ? arabicNumber(profile.version) : "لم يُحفظ بعد"}
            </strong>
          </p>
          <p className="mt-1">
            Configured targets:{" "}
            <strong className="text-foreground">
              {arabicNumber(evaluation.configured_count)}
            </strong>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-success/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <p className="mt-2 text-2xl font-bold text-success">
            {arabicNumber(evaluation.met_count)}
          </p>
          <p className="text-xs text-muted-foreground">Targets Met</p>
        </div>
        <div className="rounded-2xl border border-danger/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <XCircle className="h-4 w-4 text-danger" />
          <p className="mt-2 text-2xl font-bold text-danger">
            {arabicNumber(evaluation.not_met_count)}
          </p>
          <p className="text-xs text-muted-foreground">Targets Not Met</p>
        </div>
        <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <CircleHelp className="h-4 w-4 text-info" />
          <p className="mt-2 text-2xl font-bold text-info">
            {arabicNumber(evaluation.insufficient_count)}
          </p>
          <p className="text-xs text-muted-foreground">
            Insufficient Data
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <Gauge className="h-4 w-4 text-brand" />
          <p className="mt-2 text-2xl font-bold">
            {arabicNumber(evaluation.configured_count)}/8
          </p>
          <p className="text-xs text-muted-foreground">
            Metrics Configured
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Target Alignment</h3>
              <p className="text-[9px] text-muted-foreground">
                Actual = Current governance trend window، وليس Lifetime average.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {evaluation.assessments.map((assessment) => (
              <TargetAssessmentCard
                key={assessment.key}
                assessment={assessment}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Operating Rhythm</h3>
              <p className="text-[9px] text-muted-foreground">
                مبني فقط على آخر Finalized Meeting والـCadence الذي تحدده.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <span
              className={
                "inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold " +
                rhythmMeta.className
              }
            >
              {rhythmMeta.label}
            </span>
          </div>

          <dl className="mt-4 space-y-3 text-[10px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Cadence</dt>
              <dd className="font-semibold">
                {evaluation.rhythm.cadence_days == null
                  ? "—"
                  : arabicNumber(evaluation.rhythm.cadence_days) + " يوم"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">آخر اجتماع</dt>
              <dd className="font-semibold">
                {formatDate(
                  evaluation.rhythm.last_finalized_meeting_date,
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">موعد الاجتماع التالي</dt>
              <dd className="font-semibold">
                {formatDate(evaluation.rhythm.next_due_date)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">بداية التحذير</dt>
              <dd className="font-semibold">
                {formatDate(evaluation.rhythm.warning_date)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Days to due</dt>
              <dd
                className={
                  evaluation.rhythm.status === "overdue"
                    ? "font-semibold text-danger"
                    : evaluation.rhythm.status === "due_soon"
                      ? "font-semibold text-warning"
                      : "font-semibold"
                }
              >
                {evaluation.rhythm.days_to_due == null
                  ? "—"
                  : arabicNumber(evaluation.rhythm.days_to_due) + " يوم"}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-[8px] leading-4 text-muted-foreground">
            إذا لم تضبط Warning Days فلن يستخدم النظام حالة Due Soon؛ سيعرض
            On Schedule حتى يتجاوز الموعد الفعلي.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">Configure Targets</h3>
            <p className="text-[9px] text-muted-foreground">
              اترك أي حقل فارغًا إذا كنت لا تريد Target له. لا توجد Defaults
              ضمنية.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <TargetInput
            label="Decision Resolution"
            hint="الحد الأدنى المقبول."
            value={draft.decision_resolution_target_pct}
            onChange={(value) =>
              setDraft({
                ...draft,
                decision_resolution_target_pct: value,
              })
            }
            suffix="% ≥"
            min={0}
            max={100}
          />
          <TargetInput
            label="Deferred Rate"
            hint="الحد الأقصى المقبول."
            value={draft.max_deferred_rate_pct}
            onChange={(value) =>
              setDraft({ ...draft, max_deferred_rate_pct: value })
            }
            suffix="% ≤"
            min={0}
            max={100}
          />
          <TargetInput
            label="Action Completion"
            hint="الحد الأدنى المقبول."
            value={draft.action_completion_target_pct}
            onChange={(value) =>
              setDraft({
                ...draft,
                action_completion_target_pct: value,
              })
            }
            suffix="% ≥"
            min={0}
            max={100}
          />
          <TargetInput
            label="Overdue Open"
            hint="الحد الأقصى المقبول."
            value={draft.max_overdue_open_rate_pct}
            onChange={(value) =>
              setDraft({
                ...draft,
                max_overdue_open_rate_pct: value,
              })
            }
            suffix="% ≤"
            min={0}
            max={100}
          />
          <TargetInput
            label="Unowned Open"
            hint="الحد الأقصى المقبول."
            value={draft.max_unowned_open_rate_pct}
            onChange={(value) =>
              setDraft({
                ...draft,
                max_unowned_open_rate_pct: value,
              })
            }
            suffix="% ≤"
            min={0}
            max={100}
          />
          <TargetInput
            label="On-time Completion"
            hint="الحد الأدنى المقبول."
            value={draft.on_time_completion_target_pct}
            onChange={(value) =>
              setDraft({
                ...draft,
                on_time_completion_target_pct: value,
              })
            }
            suffix="% ≥"
            min={0}
            max={100}
          />
          <TargetInput
            label="Median Completion"
            hint="أقصى Median لأيام الإغلاق."
            value={draft.max_median_completion_days}
            onChange={(value) =>
              setDraft({
                ...draft,
                max_median_completion_days: value,
              })
            }
            suffix="يوم ≤"
            min={1}
            max={3650}
          />
          <TargetInput
            label="Repeated Deferrals"
            hint="أقصى عدد unresolved."
            value={draft.max_repeated_deferrals}
            onChange={(value) =>
              setDraft({ ...draft, max_repeated_deferrals: value })
            }
            suffix="≤"
            min={0}
            max={10000}
          />
          <TargetInput
            label="Meeting Cadence"
            hint="الفاصل المستهدف بين الاجتماعات النهائية."
            value={draft.meeting_cadence_days}
            onChange={(value) =>
              setDraft({ ...draft, meeting_cadence_days: value })
            }
            suffix="يوم"
            min={1}
            max={366}
          />
          <TargetInput
            label="Cadence Warning"
            hint="ابدأ Due Soon قبل الموعد بهذه المدة."
            value={draft.cadence_warning_days_before}
            onChange={(value) =>
              setDraft({
                ...draft,
                cadence_warning_days_before: value,
              })
            }
            suffix="يوم"
            min={0}
            max={90}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                expected_version: profile?.version ?? null,
                decision_resolution_target_pct: nullableNumber(
                  draft.decision_resolution_target_pct,
                ),
                max_deferred_rate_pct: nullableNumber(
                  draft.max_deferred_rate_pct,
                ),
                action_completion_target_pct: nullableNumber(
                  draft.action_completion_target_pct,
                ),
                max_overdue_open_rate_pct: nullableNumber(
                  draft.max_overdue_open_rate_pct,
                ),
                max_unowned_open_rate_pct: nullableNumber(
                  draft.max_unowned_open_rate_pct,
                ),
                on_time_completion_target_pct: nullableNumber(
                  draft.on_time_completion_target_pct,
                ),
                max_median_completion_days: nullableInteger(
                  draft.max_median_completion_days,
                ),
                max_repeated_deferrals: nullableInteger(
                  draft.max_repeated_deferrals,
                ),
                meeting_cadence_days: nullableInteger(
                  draft.meeting_cadence_days,
                ),
                cadence_warning_days_before: nullableInteger(
                  draft.cadence_warning_days_before,
                ),
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ Governance Targets
          </button>
        </div>
      </div>

      {!!targetData.history.length && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Target Version History</h3>
              <p className="text-[9px] text-muted-foreground">
                سجل Append-only لأحدث 25 نسخة؛ لا يعيد كتابة التاريخ.
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[80px_150px_1fr] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground md:grid">
              <span>Version</span>
              <span>Changed</span>
              <span>Configured Targets</span>
            </div>
            {targetData.history.map((row) => {
              const entries = [
                row.targets.decision_resolution_target_pct != null
                  ? "Resolution ≥ " +
                    row.targets.decision_resolution_target_pct +
                    "%"
                  : null,
                row.targets.max_deferred_rate_pct != null
                  ? "Deferred ≤ " +
                    row.targets.max_deferred_rate_pct +
                    "%"
                  : null,
                row.targets.action_completion_target_pct != null
                  ? "Action completion ≥ " +
                    row.targets.action_completion_target_pct +
                    "%"
                  : null,
                row.targets.max_overdue_open_rate_pct != null
                  ? "Overdue ≤ " +
                    row.targets.max_overdue_open_rate_pct +
                    "%"
                  : null,
                row.targets.max_unowned_open_rate_pct != null
                  ? "Unowned ≤ " +
                    row.targets.max_unowned_open_rate_pct +
                    "%"
                  : null,
                row.targets.on_time_completion_target_pct != null
                  ? "On-time ≥ " +
                    row.targets.on_time_completion_target_pct +
                    "%"
                  : null,
                row.targets.max_median_completion_days != null
                  ? "Median close ≤ " +
                    row.targets.max_median_completion_days +
                    "d"
                  : null,
                row.targets.max_repeated_deferrals != null
                  ? "Repeat deferrals ≤ " +
                    row.targets.max_repeated_deferrals
                  : null,
                row.targets.meeting_cadence_days != null
                  ? "Cadence " +
                    row.targets.meeting_cadence_days +
                    "d"
                  : null,
              ].filter((value): value is string => !!value);

              return (
                <div
                  key={row.id}
                  className="border-t border-border p-3 first:border-t-0 md:grid md:grid-cols-[80px_150px_1fr] md:items-start md:gap-2"
                >
                  <p className="text-[10px] font-semibold">
                    v{arabicNumber(row.version)}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground md:mt-0">
                    {formatDate(row.changed_at)}
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-muted-foreground md:mt-0">
                    {entries.length ? entries.join(" · ") : "لا توجد Targets مفعلة"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
        <strong className="text-foreground">منهج المقارنة:</strong> Target
        Alignment يستخدم Current governance window من Phase 40، وليس Lifetime
        average. Target History يسجل تغييرات المعايير نفسها حتى لا يُقرأ الأداء
        القديم بمعيار جديد وكأنه كان المعتمد تاريخيًا.
      </div>

      {evaluation.not_met_count > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 text-[9px] leading-5 text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          يوجد {arabicNumber(evaluation.not_met_count)} Target غير محقق في
          النافذة الحالية. هذا تنبيه إدارة، وليس حكمًا تلقائيًا على أداء فرد أو
          فريق.
        </div>
      )}
    </section>
  );
}

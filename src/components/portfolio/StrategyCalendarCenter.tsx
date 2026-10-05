import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Target,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useAcknowledgeObjectiveKrCheckin,
  useRecordRecoveryCheckpoint,
  useSaveObjectiveStrategyCadence,
  useSaveRecoveryCheckpointCadence,
} from "@/hooks/use-strategy-calendar";
import { arabicNumber } from "@/lib/format";
import type {
  ObjectiveRecoveryPlan,
  ObjectiveStrategyCadence,
  PortfolioObjective,
  PortfolioStrategyData,
  RecoveryCheckpointAssessment,
  RecoveryCheckpointCadence,
  RecoveryPlanData,
  StrategyCalendarData,
  StrategyCalendarEvent,
  StrategyCalendarEventType,
} from "@/types/strategy";

const EVENT_LABELS: Record<StrategyCalendarEventType, string> = {
  strategy_review: "Strategy Review",
  kr_update: "KR Update",
  benefit_review: "Benefit Review",
  recovery_checkpoint: "Recovery Checkpoint",
  recovery_commitment: "Recovery Commitment",
};

const CHECKPOINT_LABELS: Record<RecoveryCheckpointAssessment, string> = {
  on_track: "على المسار",
  at_risk: "معرض للخطر",
  off_track: "خارج المسار",
  recovered: "تمت الاستعادة",
};

interface ObjectiveCadenceDraft {
  objective_id: string;
  expected_version: number | null;
  review_interval_days: number;
  kr_update_interval_days: number;
  reminder_days_before: number;
  review_anchor_date: string;
  kr_anchor_date: string;
  is_enabled: boolean;
}

interface RecoveryCadenceDraft {
  plan_id: string;
  expected_version: number | null;
  checkpoint_interval_days: number;
  reminder_days_before: number;
  anchor_date: string;
  is_enabled: boolean;
}

interface CheckpointDraft {
  plan_id: string;
  assessment: RecoveryCheckpointAssessment;
  note: string;
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateFromKey(value: string) {
  return new Date(value + "T12:00:00Z");
}

function addDays(value: string, days: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(dateFromKey(value));
}

function objectiveDraft(
  objective: PortfolioObjective,
  cadence: ObjectiveStrategyCadence | undefined,
): ObjectiveCadenceDraft {
  const today = todayKey();
  return cadence
    ? {
        objective_id: objective.id,
        expected_version: cadence.version,
        review_interval_days: cadence.review_interval_days,
        kr_update_interval_days: cadence.kr_update_interval_days,
        reminder_days_before: cadence.reminder_days_before,
        review_anchor_date: cadence.review_anchor_date,
        kr_anchor_date: cadence.kr_anchor_date,
        is_enabled: cadence.is_enabled,
      }
    : {
        objective_id: objective.id,
        expected_version: null,
        review_interval_days: 90,
        kr_update_interval_days: 30,
        reminder_days_before: 7,
        review_anchor_date: today,
        kr_anchor_date: today,
        is_enabled: true,
      };
}

function recoveryDraft(
  plan: ObjectiveRecoveryPlan,
  cadence: RecoveryCheckpointCadence | undefined,
): RecoveryCadenceDraft {
  const today = todayKey();
  return cadence
    ? {
        plan_id: plan.id,
        expected_version: cadence.version,
        checkpoint_interval_days: cadence.checkpoint_interval_days,
        reminder_days_before: cadence.reminder_days_before,
        anchor_date: cadence.anchor_date,
        is_enabled: cadence.is_enabled,
      }
    : {
        plan_id: plan.id,
        expected_version: null,
        checkpoint_interval_days: 14,
        reminder_days_before: 3,
        anchor_date: plan.activated_at?.slice(0, 10) ?? today,
        is_enabled: true,
      };
}

function eventTone(event: StrategyCalendarEvent) {
  if (event.status === "overdue") {
    return "border-danger/20 bg-danger/5";
  }
  if (event.status === "due_soon") {
    return "border-warning/20 bg-warning/5";
  }
  return "border-border bg-background";
}

function eventBadge(event: StrategyCalendarEvent) {
  if (event.status === "overdue") {
    return "bg-danger/10 text-danger";
  }
  if (event.status === "due_soon") {
    return "bg-warning/10 text-warning";
  }
  return "bg-muted text-muted-foreground";
}

export function StrategyCalendarCenter({
  strategy,
  calendar,
  recoveryData,
  isLoading,
}: {
  strategy: PortfolioStrategyData | undefined;
  calendar: StrategyCalendarData | undefined;
  recoveryData: RecoveryPlanData | undefined;
  isLoading: boolean;
}) {
  const saveObjectiveCadence = useSaveObjectiveStrategyCadence();
  const acknowledgeKr = useAcknowledgeObjectiveKrCheckin();
  const saveRecoveryCadence = useSaveRecoveryCheckpointCadence();
  const recordCheckpoint = useRecordRecoveryCheckpoint();

  const objectives = strategy?.objectives ?? [];
  const events = calendar?.events ?? [];
  const plans = recoveryData?.plans ?? [];
  const today = useMemo(todayKey, []);
  const nextSeven = useMemo(() => addDays(today, 7), [today]);

  const [objectiveCadenceDraft, setObjectiveCadenceDraft] =
    useState<ObjectiveCadenceDraft | null>(null);
  const [recoveryCadenceDraft, setRecoveryCadenceDraft] =
    useState<RecoveryCadenceDraft | null>(null);
  const [checkpointDraft, setCheckpointDraft] =
    useState<CheckpointDraft | null>(null);
  const [eventFilter, setEventFilter] = useState<
    "all" | StrategyCalendarEventType
  >("all");

  const objectiveMap = useMemo(
    () => new Map(objectives.map((row) => [row.id, row] as const)),
    [objectives],
  );
  const cadenceMap = useMemo(
    () =>
      new Map(
        (calendar?.objective_cadences ?? []).map((row) => [
          row.objective_id,
          row,
        ] as const),
      ),
    [calendar?.objective_cadences],
  );
  const recoveryCadenceMap = useMemo(
    () =>
      new Map(
        (calendar?.recovery_cadences ?? []).map((row) => [
          row.plan_id,
          row,
        ] as const),
      ),
    [calendar?.recovery_cadences],
  );

  const overdue = events.filter((event) => event.status === "overdue");
  const dueNextSeven = events.filter(
    (event) => event.due_date >= today && event.due_date <= nextSeven,
  );
  const cadenceEnabled = (calendar?.objective_cadences ?? []).filter(
    (row) => row.is_enabled,
  ).length;
  const recoveryCadenceEnabled = (calendar?.recovery_cadences ?? []).filter(
    (row) => row.is_enabled,
  ).length;

  const visibleEvents = events.filter(
    (event) => eventFilter === "all" || event.event_type === eventFilter,
  );

  const activeRecoveryPlans = plans.filter((plan) => plan.status === "active");

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل التقويم الاستراتيجي…
        </div>
      </section>
    );
  }

  if (!objectives.length) return null;

  const selectedObjective = objectiveCadenceDraft
    ? objectiveMap.get(objectiveCadenceDraft.objective_id) ?? null
    : null;
  const selectedRecoveryPlan = recoveryCadenceDraft
    ? plans.find((plan) => plan.id === recoveryCadenceDraft.plan_id) ?? null
    : null;
  const checkpointPlan = checkpointDraft
    ? plans.find((plan) => plan.id === checkpointDraft.plan_id) ?? null
    : null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5 text-brand" />
          التقويم الاستراتيجي ودورية المراجعات
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          أجندة تنفيذية موحدة لمراجعات Strategy وKR Updates وBenefits وRecovery
          Checkpoints وCommitments.
        </p>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        لا يبدأ أي Review/KR/Recovery cadence إلا بعد حفظه صراحة. Benefit وCommitment
        dates تُقرأ من التواريخ المسجلة أصلًا. Reminder lead يحدد متى يتحول الموعد
        إلى Due Soon، بينما التأخير يعتمد على تاريخ الاستحقاق نفسه.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "مواعيد متأخرة",
            value: overdue.length,
            icon: AlertTriangle,
            tone: "text-danger",
          },
          {
            label: "خلال 7 أيام",
            value: dueNextSeven.length,
            icon: Clock3,
            tone: "text-warning",
          },
          {
            label: "Objective cadence مفعلة",
            value: cadenceEnabled,
            icon: Target,
            tone: "text-info",
          },
          {
            label: "Recovery cadence مفعلة",
            value: recoveryCadenceEnabled,
            icon: RotateCcw,
            tone: "text-info",
          },
          {
            label: "إجمالي عناصر الأجندة",
            value: events.length,
            icon: CalendarClock,
            tone: "text-brand",
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

      {objectiveCadenceDraft && selectedObjective && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Objective cadence</h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {selectedObjective.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setObjectiveCadenceDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-[10px] text-muted-foreground">
              Strategy Review كل
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={366}
                  value={objectiveCadenceDraft.review_interval_days}
                  onChange={(event) =>
                    setObjectiveCadenceDraft((current) =>
                      current
                        ? {
                            ...current,
                            review_interval_days: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
                <span className="text-[9px]">يوم</span>
              </div>
            </label>

            <label className="text-[10px] text-muted-foreground">
              KR Update كل
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={366}
                  value={objectiveCadenceDraft.kr_update_interval_days}
                  onChange={(event) =>
                    setObjectiveCadenceDraft((current) =>
                      current
                        ? {
                            ...current,
                            kr_update_interval_days: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
                <span className="text-[9px]">يوم</span>
              </div>
            </label>

            <label className="text-[10px] text-muted-foreground">
              التنبيه قبل الموعد
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={objectiveCadenceDraft.reminder_days_before}
                  onChange={(event) =>
                    setObjectiveCadenceDraft((current) =>
                      current
                        ? {
                            ...current,
                            reminder_days_before: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
                <span className="text-[9px]">يوم</span>
              </div>
            </label>

            <label className="flex items-end gap-2 rounded-xl border border-border p-3 text-[10px]">
              <input
                type="checkbox"
                checked={objectiveCadenceDraft.is_enabled}
                onChange={(event) =>
                  setObjectiveCadenceDraft((current) =>
                    current
                      ? { ...current, is_enabled: event.target.checked }
                      : current,
                  )
                }
              />
              <span>cadence مفعلة</span>
            </label>

            <label className="text-[10px] text-muted-foreground">
              Review anchor
              <input
                type="date"
                value={objectiveCadenceDraft.review_anchor_date}
                onChange={(event) =>
                  setObjectiveCadenceDraft((current) =>
                    current
                      ? { ...current, review_anchor_date: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>

            <label className="text-[10px] text-muted-foreground">
              KR anchor
              <input
                type="date"
                value={objectiveCadenceDraft.kr_anchor_date}
                onChange={(event) =>
                  setObjectiveCadenceDraft((current) =>
                    current
                      ? { ...current, kr_anchor_date: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={
              !objectiveCadenceDraft.review_anchor_date ||
              !objectiveCadenceDraft.kr_anchor_date ||
              saveObjectiveCadence.isPending
            }
            onClick={() =>
              saveObjectiveCadence.mutate(objectiveCadenceDraft, {
                onSuccess: () => setObjectiveCadenceDraft(null),
              })
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ cadence
          </button>
        </div>
      )}

      {recoveryCadenceDraft && selectedRecoveryPlan && (
        <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Recovery Checkpoint cadence</h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {selectedRecoveryPlan.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRecoveryCadenceDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-[10px] text-muted-foreground">
              Checkpoint كل
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={recoveryCadenceDraft.checkpoint_interval_days}
                  onChange={(event) =>
                    setRecoveryCadenceDraft((current) =>
                      current
                        ? {
                            ...current,
                            checkpoint_interval_days: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
                <span className="text-[9px]">يوم</span>
              </div>
            </label>

            <label className="text-[10px] text-muted-foreground">
              Reminder lead
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={recoveryCadenceDraft.reminder_days_before}
                  onChange={(event) =>
                    setRecoveryCadenceDraft((current) =>
                      current
                        ? {
                            ...current,
                            reminder_days_before: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
                <span className="text-[9px]">يوم</span>
              </div>
            </label>

            <label className="text-[10px] text-muted-foreground">
              Anchor
              <input
                type="date"
                value={recoveryCadenceDraft.anchor_date}
                onChange={(event) =>
                  setRecoveryCadenceDraft((current) =>
                    current
                      ? { ...current, anchor_date: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>

            <label className="flex items-end gap-2 rounded-xl border border-border p-3 text-[10px]">
              <input
                type="checkbox"
                checked={recoveryCadenceDraft.is_enabled}
                onChange={(event) =>
                  setRecoveryCadenceDraft((current) =>
                    current
                      ? { ...current, is_enabled: event.target.checked }
                      : current,
                  )
                }
              />
              <span>cadence مفعلة</span>
            </label>
          </div>

          <button
            type="button"
            disabled={
              !recoveryCadenceDraft.anchor_date ||
              saveRecoveryCadence.isPending
            }
            onClick={() =>
              saveRecoveryCadence.mutate(recoveryCadenceDraft, {
                onSuccess: () => setRecoveryCadenceDraft(null),
              })
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ Recovery cadence
          </button>
        </div>
      )}

      {checkpointDraft && checkpointPlan && (
        <div className="rounded-2xl border border-success/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">تسجيل Recovery Checkpoint</h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {checkpointPlan.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCheckpointDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr]">
            <label className="text-[10px] text-muted-foreground">
              Assessment
              <select
                value={checkpointDraft.assessment}
                onChange={(event) =>
                  setCheckpointDraft((current) =>
                    current
                      ? {
                          ...current,
                          assessment: event.target
                            .value as RecoveryCheckpointAssessment,
                        }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(CHECKPOINT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[10px] text-muted-foreground">
              ملاحظات Checkpoint
              <textarea
                rows={3}
                maxLength={5000}
                value={checkpointDraft.note}
                onChange={(event) =>
                  setCheckpointDraft((current) =>
                    current ? { ...current, note: event.target.value } : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={recordCheckpoint.isPending}
            onClick={() =>
              recordCheckpoint.mutate(
                {
                  plan_id: checkpointDraft.plan_id,
                  assessment: checkpointDraft.assessment,
                  note: checkpointDraft.note || null,
                },
                { onSuccess: () => setCheckpointDraft(null) },
              )
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <ClipboardCheck className="h-4 w-4" />
            تسجيل Checkpoint
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Objective Review Cadence</h3>
            <span className="text-[9px] text-muted-foreground">
              لا تُفعل افتراضيًا
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {objectives.map((objective) => {
              const cadence = cadenceMap.get(objective.id);
              const reviewEvent = events.find(
                (event) =>
                  event.objective_id === objective.id &&
                  event.event_type === "strategy_review",
              );
              const krEvent = events.find(
                (event) =>
                  event.objective_id === objective.id &&
                  event.event_type === "kr_update",
              );

              return (
                <div
                  key={objective.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {objective.title}
                      </p>
                      {cadence ? (
                        <p className="mt-1 text-[9px] text-muted-foreground">
                          Review كل {cadence.review_interval_days} يوم · KR كل{" "}
                          {cadence.kr_update_interval_days} يوم · Reminder{" "}
                          {cadence.reminder_days_before} يوم
                        </p>
                      ) : (
                        <p className="mt-1 text-[9px] text-muted-foreground">
                          cadence غير مفعلة
                        </p>
                      )}
                    </div>

                    {objective.can_edit && (
                      <button
                        type="button"
                        onClick={() =>
                          setObjectiveCadenceDraft(
                            objectiveDraft(objective, cadence),
                          )
                        }
                        className="rounded-lg border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground hover:bg-muted"
                      >
                        {cadence ? "تعديل" : "تفعيل"}
                      </button>
                    )}
                  </div>

                  {cadence && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-muted-foreground">Next Review</p>
                        <p
                          className={
                            reviewEvent?.status === "overdue"
                              ? "mt-1 font-semibold text-danger"
                              : "mt-1 font-semibold"
                          }
                        >
                          {formatDate(reviewEvent?.due_date ?? null)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-muted-foreground">Next KR Update</p>
                        <p
                          className={
                            krEvent?.status === "overdue"
                              ? "mt-1 font-semibold text-danger"
                              : "mt-1 font-semibold"
                          }
                        >
                          {formatDate(krEvent?.due_date ?? null)}
                        </p>
                      </div>
                    </div>
                  )}

                  {cadence && objective.can_edit && (
                    <button
                      type="button"
                      disabled={acknowledgeKr.isPending}
                      onClick={() =>
                        acknowledgeKr.mutate({ objectiveId: objective.id })
                      }
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[9px] text-brand disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      تم تحديث KRs اليوم
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Recovery Checkpoint Cadence</h3>
            <span className="text-[9px] text-muted-foreground">
              للخطط النشطة فقط
            </span>
          </div>

          {!activeRecoveryPlans.length ? (
            <div className="mt-3 rounded-xl border border-dashed border-border p-5 text-center text-[10px] text-muted-foreground">
              لا توجد Recovery Plans نشطة حاليًا.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {activeRecoveryPlans.map((plan) => {
                const cadence = recoveryCadenceMap.get(plan.id);
                const event = events.find(
                  (row) =>
                    row.source_id === plan.id &&
                    row.event_type === "recovery_checkpoint",
                );
                const objective = objectiveMap.get(plan.objective_id);

                return (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {plan.title}
                        </p>
                        <p className="mt-1 truncate text-[9px] text-muted-foreground">
                          {objective?.title ?? "Objective"}
                        </p>
                      </div>

                      {objective?.can_edit && (
                        <button
                          type="button"
                          onClick={() =>
                            setRecoveryCadenceDraft(
                              recoveryDraft(plan, cadence),
                            )
                          }
                          className="rounded-lg border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground hover:bg-muted"
                        >
                          {cadence ? "تعديل" : "تفعيل"}
                        </button>
                      )}
                    </div>

                    {cadence && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px]">
                        <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                          كل {cadence.checkpoint_interval_days} يوم
                        </span>
                        <span
                          className={
                            event?.status === "overdue"
                              ? "rounded-full bg-danger/10 px-2 py-1 text-danger"
                              : event?.status === "due_soon"
                                ? "rounded-full bg-warning/10 px-2 py-1 text-warning"
                                : "rounded-full bg-muted px-2 py-1 text-muted-foreground"
                          }
                        >
                          التالي: {formatDate(event?.due_date ?? null)}
                        </span>
                      </div>
                    )}

                    {cadence && objective?.can_edit && (
                      <button
                        type="button"
                        onClick={() =>
                          setCheckpointDraft({
                            plan_id: plan.id,
                            assessment: "on_track",
                            note: "",
                          })
                        }
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-[9px] text-success"
                      >
                        <Plus className="h-3 w-3" />
                        سجل Checkpoint
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Executive Agenda</h3>
            <p className="mt-1 text-[9px] text-muted-foreground">
              مرتبة حسب Due Date، مع فصل واضح بين Overdue وDue Soon وUpcoming.
            </p>
          </div>

          <select
            value={eventFilter}
            onChange={(event) =>
              setEventFilter(
                event.target.value as
                  | "all"
                  | StrategyCalendarEventType,
              )
            }
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="all">كل عناصر الأجندة</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {!visibleEvents.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-[10px] text-muted-foreground">
            لا توجد مواعيد مطابقة للفلتر الحالي.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {visibleEvents.map((event) => (
              <div
                key={
                  event.event_type +
                  ":" +
                  event.source_id +
                  ":" +
                  event.due_date
                }
                className={"flex flex-col gap-2 p-3 md:flex-row md:items-center " + eventTone(event)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{event.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                      {EVENT_LABELS[event.event_type]}
                    </span>
                    <span
                      className={"rounded-full px-2 py-0.5 text-[8px] " + eventBadge(event)}
                    >
                      {event.status === "overdue"
                        ? "Overdue"
                        : event.status === "due_soon"
                          ? "Due Soon"
                          : "Upcoming"}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {event.objective_title}
                  </p>
                </div>

                <div className="shrink-0 text-start md:text-end">
                  <p
                    className={
                      event.status === "overdue"
                        ? "text-xs font-semibold text-danger"
                        : "text-xs font-semibold"
                    }
                  >
                    {formatDate(event.due_date)}
                  </p>
                  <p className="mt-0.5 text-[8px] text-muted-foreground">
                    Reminder: {event.reminder_days_before} يوم
                  </p>
                </div>

                {event.event_type === "kr_update" &&
                  objectiveMap.get(event.objective_id)?.can_edit && (
                    <button
                      type="button"
                      disabled={acknowledgeKr.isPending}
                      onClick={() =>
                        acknowledgeKr.mutate({
                          objectiveId: event.objective_id,
                        })
                      }
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[9px] text-brand disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      تم التحديث
                    </button>
                  )}

                {event.event_type === "recovery_checkpoint" &&
                  objectiveMap.get(event.objective_id)?.can_edit && (
                    <button
                      type="button"
                      onClick={() =>
                        setCheckpointDraft({
                          plan_id: event.source_id,
                          assessment: "on_track",
                          note: "",
                        })
                      }
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-[9px] text-success"
                    >
                      <ClipboardCheck className="h-3 w-3" />
                      Checkpoint
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useSaveObjectiveRecoveryPlan } from "@/hooks/use-strategy-recovery";
import { buildObjectiveForecast } from "@/services/strategy-forecast.service";
import { assessRecoveryPlanEffectiveness } from "@/services/strategy-recovery.service";
import { arabicNumber } from "@/lib/format";
import type { ProjectCollaborator } from "@/types/collaboration";
import type {
  ObjectiveRecoveryPlan,
  PortfolioStrategyData,
  RecoveryCommitmentStatus,
  RecoveryPlanData,
  RecoveryPlanStatus,
  RecoveryTriggerReason,
  StrategyReviewData,
} from "@/types/strategy";

const PLAN_STATUS: Record<RecoveryPlanStatus, string> = {
  draft: "مسودة",
  active: "نشطة",
  recovered: "تمت الاستعادة",
  closed: "مغلقة",
  cancelled: "ملغاة",
};

const COMMITMENT_STATUS: Record<RecoveryCommitmentStatus, string> = {
  open: "مفتوح",
  in_progress: "قيد التنفيذ",
  done: "مكتمل",
  cancelled: "ملغى",
};

const TRIGGER_LABEL: Record<RecoveryTriggerReason, string> = {
  manual: "يدوي",
  projected_late: "Forecast متأخر",
  stalled: "Trend متوقف",
  overdue: "Objective متجاوز الموعد",
};

interface CommitmentDraft {
  id: string | null;
  title: string;
  description: string;
  owner_user_id: string;
  due_date: string;
  status: RecoveryCommitmentStatus;
}

interface RecoveryDraft {
  id: string | null;
  expected_version: number | null;
  objective_id: string;
  title: string;
  summary: string;
  success_criteria: string;
  trigger_reason: RecoveryTriggerReason;
  status: RecoveryPlanStatus;
  owner_user_id: string;
  target_recovery_date: string;
  commitments: CommitmentDraft[];
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
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

function signed(value: number | null, suffix = "") {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return (rounded > 0 ? "+" : "") + rounded + suffix;
}

function triggerFromForecast(
  status: ReturnType<typeof buildObjectiveForecast>["status"],
): RecoveryTriggerReason {
  if (status === "projected_late") return "projected_late";
  if (status === "stalled") return "stalled";
  if (status === "overdue") return "overdue";
  return "manual";
}

function isRecoveryForecast(
  status: ReturnType<typeof buildObjectiveForecast>["status"],
) {
  return (
    status === "projected_late" ||
    status === "stalled" ||
    status === "overdue"
  );
}

function planDraft(
  objectiveId: string,
  title: string,
  trigger: RecoveryTriggerReason,
): RecoveryDraft {
  return {
    id: null,
    expected_version: null,
    objective_id: objectiveId,
    title: "خطة تعافي — " + title,
    summary: "",
    success_criteria: "",
    trigger_reason: trigger,
    status: "active",
    owner_user_id: "",
    target_recovery_date: "",
    commitments: [],
  };
}

function editDraft(plan: ObjectiveRecoveryPlan): RecoveryDraft {
  return {
    id: plan.id,
    expected_version: plan.version,
    objective_id: plan.objective_id,
    title: plan.title,
    summary: plan.summary ?? "",
    success_criteria: plan.success_criteria ?? "",
    trigger_reason: plan.trigger_reason,
    status: plan.status,
    owner_user_id: plan.owner_user_id ?? "",
    target_recovery_date: plan.target_recovery_date ?? "",
    commitments: plan.commitments.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      owner_user_id: row.owner_user_id ?? "",
      due_date: row.due_date ?? "",
      status: row.status,
    })),
  };
}

function uniquePeople(
  projectIds: string[],
  collaboratorsByProject: Record<string, ProjectCollaborator[]>,
) {
  const rows = new Map<string, ProjectCollaborator>();
  for (const projectId of projectIds) {
    for (const collaborator of collaboratorsByProject[projectId] ?? []) {
      rows.set(collaborator.user_id, collaborator);
    }
  }
  return [...rows.values()].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "ar"),
  );
}

export function StrategyRecoveryCenter({
  strategy,
  reviewData,
  recoveryData,
  collaboratorsByProject,
  isLoading,
}: {
  strategy: PortfolioStrategyData | undefined;
  reviewData: StrategyReviewData | undefined;
  recoveryData: RecoveryPlanData | undefined;
  collaboratorsByProject: Record<string, ProjectCollaborator[]>;
  isLoading: boolean;
}) {
  const save = useSaveObjectiveRecoveryPlan();
  const objectives = strategy?.objectives ?? [];
  const plans = recoveryData?.plans ?? [];
  const today = useMemo(todayKey, []);
  const [draft, setDraft] = useState<RecoveryDraft | null>(null);

  const objectiveMap = useMemo(
    () => new Map(objectives.map((row) => [row.id, row] as const)),
    [objectives],
  );
  const forecastMap = useMemo(
    () =>
      new Map(
        objectives.map((objective) => [
          objective.id,
          buildObjectiveForecast(objective, reviewData?.reviews ?? []),
        ] as const),
      ),
    [objectives, reviewData?.reviews],
  );

  const effectivenessMap = useMemo(
    () =>
      new Map(
        plans
          .map((plan) => {
            const objective = objectiveMap.get(plan.objective_id);
            if (!objective) return null;
            return [
              plan.id,
              assessRecoveryPlanEffectiveness(
                plan,
                objective,
                reviewData?.reviews ?? [],
              ),
            ] as const;
          })
          .filter((row): row is NonNullable<typeof row> => !!row),
      ),
    [plans, objectiveMap, reviewData?.reviews],
  );

  const activePlans = plans.filter((plan) => plan.status === "active");
  const overdueCommitments = plans.flatMap((plan) =>
    plan.commitments.filter(
      (row) =>
        (row.status === "open" || row.status === "in_progress") &&
        !!row.due_date &&
        row.due_date < today,
    ),
  );
  const doneCommitments = plans.flatMap((plan) =>
    plan.commitments.filter((row) => row.status === "done"),
  ).length;
  const improvedPlans = activePlans.filter(
    (plan) => effectivenessMap.get(plan.id)?.assessment === "improved",
  ).length;
  const recoveryNeeded = objectives.filter((objective) => {
    const forecast = forecastMap.get(objective.id);
    const hasActive = activePlans.some(
      (plan) => plan.objective_id === objective.id,
    );
    return !!forecast && isRecoveryForecast(forecast.status) && !hasActive;
  });

  function startForObjective(objectiveId: string) {
    const objective = objectiveMap.get(objectiveId);
    if (!objective) return;
    const forecast = forecastMap.get(objectiveId);
    setDraft(
      planDraft(
        objective.id,
        objective.title,
        triggerFromForecast(forecast?.status ?? "insufficient_data"),
      ),
    );
  }

  function candidatesFor(objectiveId: string) {
    const objective = objectiveMap.get(objectiveId);
    if (!objective) return [];
    return uniquePeople(objective.project_ids, collaboratorsByProject);
  }

  function addCommitment() {
    setDraft((current) =>
      current
        ? {
            ...current,
            commitments: [
              ...current.commitments,
              {
                id: null,
                title: "",
                description: "",
                owner_user_id: "",
                due_date: "",
                status: "open",
              },
            ],
          }
        : current,
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل خطط التعافي والالتزامات…
        </div>
      </section>
    );
  }

  if (!objectives.length) return null;

  const draftObjective = draft
    ? objectiveMap.get(draft.objective_id) ?? null
    : null;
  const draftCandidates = draft
    ? candidatesFor(draft.objective_id)
    : [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand" />
          خطط التعافي والالتزامات
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          حوّل Forecast المتأخر أو الـStalled إلى Recovery Plan رسمية، ثم راقب
          Commitments وهل تحسن Trend فعليًا بعد التنفيذ.
        </p>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        Baseline Progress وTrend يُثبتان عند إنشاء الخطة ولا يتغيران لاحقًا.
        «تحسن Trend» = زيادة أكثر من +0.1 نقطة/أسبوع عن Baseline؛ «تراجع» =
        انخفاض أكثر من -0.1؛ وما بينهما يُعرض «دون تغير جوهري».
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "تحتاج Recovery Plan",
            value: recoveryNeeded.length,
            icon: AlertTriangle,
            tone: "text-danger",
          },
          {
            label: "خطط نشطة",
            value: activePlans.length,
            icon: ClipboardList,
            tone: "text-info",
          },
          {
            label: "Trend تحسن",
            value: improvedPlans,
            icon: TrendingUp,
            tone: "text-success",
          },
          {
            label: "Commitments متأخرة",
            value: overdueCommitments.length,
            icon: CalendarClock,
            tone: "text-danger",
          },
          {
            label: "Commitments مكتملة",
            value: doneCommitments,
            icon: CheckCircle2,
            tone: "text-success",
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

      {!!recoveryNeeded.length && (
        <div className="rounded-2xl border border-danger/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <h3 className="text-sm font-semibold">Objectives تحتاج خطة تعافٍ</h3>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {recoveryNeeded.map((objective) => {
              const forecast = forecastMap.get(objective.id)!;
              return (
                <div
                  key={objective.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {objective.title}
                    </p>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      {forecast.status === "projected_late"
                        ? "Forecast متوقع متأخرًا"
                        : forecast.status === "stalled"
                          ? "Trend متوقف/سلبي"
                          : "Objective متجاوز الموعد"}
                    </p>
                  </div>
                  {objective.can_edit && (
                    <button
                      type="button"
                      onClick={() => startForObjective(objective.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-danger px-2.5 py-1.5 text-[9px] font-semibold text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      خطة تعافٍ
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {draft && draftObjective && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {draft.id ? "تعديل Recovery Plan" : "Recovery Plan جديدة"}
              </h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {draftObjective.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              عنوان الخطة
              <input
                value={draft.title}
                maxLength={200}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              الحالة
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          status: event.target.value as RecoveryPlanStatus,
                        }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(PLAN_STATUS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              Recovery target
              <input
                type="date"
                value={draft.target_recovery_date}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, target_recovery_date: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Plan Owner
              <select
                value={draft.owner_user_id}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, owner_user_id: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">بدون مسؤول</option>
                {draftCandidates.map((person) => (
                  <option key={person.user_id} value={person.user_id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              Trigger
              <select
                value={draft.trigger_reason}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          trigger_reason: event.target
                            .value as RecoveryTriggerReason,
                        }
                      : current,
                  )
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {Object.entries(TRIGGER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              ملخص خطة التعافي
              <textarea
                rows={3}
                maxLength={7000}
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, summary: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              معايير استعادة المسار
              <textarea
                rows={3}
                maxLength={5000}
                value={draft.success_criteria}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, success_criteria: event.target.value }
                      : current,
                  )
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold">Commitments</h4>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  إجراءات تصحيحية قابلة للإسناد والمتابعة حتى الإغلاق.
                </p>
              </div>
              <button
                type="button"
                onClick={addCommitment}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                Commitment
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {draft.commitments.map((commitment, index) => (
                <div
                  key={commitment.id ?? index}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_.8fr_.7fr_.7fr_auto]">
                    <input
                      value={commitment.title}
                      placeholder="الإجراء التصحيحي"
                      maxLength={200}
                      onChange={(event) =>
                        setDraft((current) => {
                          if (!current) return current;
                          const rows = [...current.commitments];
                          rows[index] = {
                            ...rows[index]!,
                            title: event.target.value,
                          };
                          return { ...current, commitments: rows };
                        })
                      }
                      className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                    />
                    <select
                      value={commitment.owner_user_id}
                      onChange={(event) =>
                        setDraft((current) => {
                          if (!current) return current;
                          const rows = [...current.commitments];
                          rows[index] = {
                            ...rows[index]!,
                            owner_user_id: event.target.value,
                          };
                          return { ...current, commitments: rows };
                        })
                      }
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      <option value="">بدون مسؤول</option>
                      {draftCandidates.map((person) => (
                        <option key={person.user_id} value={person.user_id}>
                          {person.full_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={commitment.due_date}
                      onChange={(event) =>
                        setDraft((current) => {
                          if (!current) return current;
                          const rows = [...current.commitments];
                          rows[index] = {
                            ...rows[index]!,
                            due_date: event.target.value,
                          };
                          return { ...current, commitments: rows };
                        })
                      }
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    />
                    <select
                      value={commitment.status}
                      onChange={(event) =>
                        setDraft((current) => {
                          if (!current) return current;
                          const rows = [...current.commitments];
                          rows[index] = {
                            ...rows[index]!,
                            status: event.target
                              .value as RecoveryCommitmentStatus,
                          };
                          return { ...current, commitments: rows };
                        })
                      }
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      {Object.entries(COMMITMENT_STATUS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => {
                          if (!current) return current;
                          const row = current.commitments[index]!;
                          if (row.id) {
                            const rows = [...current.commitments];
                            rows[index] = { ...row, status: "cancelled" };
                            return { ...current, commitments: rows };
                          }
                          return {
                            ...current,
                            commitments: current.commitments.filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          };
                        })
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-2 text-[9px] text-muted-foreground hover:bg-muted"
                    >
                      {commitment.id ? "إلغاء" : "حذف"}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={4000}
                    value={commitment.description}
                    placeholder="تفاصيل الإجراء…"
                    onChange={(event) =>
                      setDraft((current) => {
                        if (!current) return current;
                        const rows = [...current.commitments];
                        rows[index] = {
                          ...rows[index]!,
                          description: event.target.value,
                        };
                        return { ...current, commitments: rows };
                      })
                    }
                    className="mt-2 w-full resize-y rounded-lg border border-border bg-card px-2.5 py-2 text-[10px]"
                  />
                </div>
              ))}
              {!draft.commitments.length && (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                  يمكن حفظ الخطة أولًا ثم إضافة Commitments، لكن يفضل تحديد
                  إجراءات قابلة للمساءلة قبل تفعيل Recovery Plan.
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={!draft.title.trim() || save.isPending}
            onClick={() => {
              const people = new Map(
                draftCandidates.map((person) => [
                  person.user_id,
                  person.full_name,
                ] as const),
              );
              save.mutate(
                {
                  objective_id: draft.objective_id,
                  id: draft.id,
                  expected_version: draft.expected_version,
                  title: draft.title,
                  summary: draft.summary || null,
                  success_criteria: draft.success_criteria || null,
                  trigger_reason: draft.trigger_reason,
                  status: draft.status,
                  owner_user_id: draft.owner_user_id || null,
                  owner_name: people.get(draft.owner_user_id) ?? null,
                  target_recovery_date: draft.target_recovery_date || null,
                  commitments: draft.commitments.map((row) => ({
                    id: row.id,
                    title: row.title,
                    description: row.description || null,
                    owner_user_id: row.owner_user_id || null,
                    owner_name: people.get(row.owner_user_id) ?? null,
                    due_date: row.due_date || null,
                    status: row.status,
                  })),
                },
                { onSuccess: () => setDraft(null) },
              );
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            حفظ Recovery Plan
          </button>
        </div>
      )}

      {!plans.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">لا توجد Recovery Plans بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            عند ظهور Forecast متأخر أو Stalled ستظهر الأهداف المرشحة أعلاه.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => {
            const objective = objectiveMap.get(plan.objective_id);
            if (!objective) return null;
            const effect = effectivenessMap.get(plan.id);
            const activeCommitments = plan.commitments.filter(
              (row) =>
                row.status === "open" || row.status === "in_progress",
            );
            const planOverdue =
              plan.status === "active" &&
              !!plan.target_recovery_date &&
              plan.target_recovery_date < today;
            const overdue = activeCommitments.filter(
              (row) => !!row.due_date && row.due_date < today,
            );
            const done = plan.commitments.filter(
              (row) => row.status === "done",
            ).length;
            const live = plan.commitments.filter(
              (row) => row.status !== "cancelled",
            ).length;

            const effectMeta =
              effect?.assessment === "improved"
                ? {
                    label: "Trend تحسن",
                    className: "bg-success/10 text-success",
                    icon: TrendingUp,
                  }
                : effect?.assessment === "worsened"
                  ? {
                      label: "Trend تراجع",
                      className: "bg-danger/10 text-danger",
                      icon: TrendingDown,
                    }
                  : effect?.assessment === "unchanged"
                    ? {
                        label: "دون تغير جوهري",
                        className: "bg-warning/10 text-warning",
                        icon: RotateCcw,
                      }
                    : {
                        label: "بيانات غير كافية",
                        className: "bg-muted text-muted-foreground",
                        icon: RotateCcw,
                      };
            const EffectIcon = effectMeta.icon;

            return (
              <article
                key={plan.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{plan.title}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
                        {PLAN_STATUS[plan.status]}
                      </span>
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] " +
                          effectMeta.className
                        }
                      >
                        <EffectIcon className="h-3 w-3" />
                        {effectMeta.label}
                      </span>
                      {planOverdue && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[9px] text-danger">
                          Recovery target متأخر
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      {objective.title} · {TRIGGER_LABEL[plan.trigger_reason]}
                    </p>
                  </div>
                  {objective.can_edit && (
                    <button
                      type="button"
                      onClick={() => setDraft(editDraft(plan))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground hover:bg-muted"
                    >
                      تعديل
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-muted/25 p-3">
                    <p className="text-[8px] text-muted-foreground">Plan Owner</p>
                    <p className="mt-1 truncate text-[10px] font-semibold">
                      {plan.owner_name ?? "غير محدد"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/25 p-3">
                    <p className="text-[8px] text-muted-foreground">Recovery target</p>
                    <p className={planOverdue ? "mt-1 text-[10px] font-semibold text-danger" : "mt-1 text-[10px] font-semibold"}>
                      {formatDate(plan.target_recovery_date)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/25 p-3">
                    <p className="text-[8px] text-muted-foreground">Trend أسبوعي</p>
                    <p className="mt-1 text-[10px] font-semibold">
                      {signed(effect?.baseline_weekly_rate ?? null, " → ")}
                      {effect?.current_weekly_rate == null
                        ? "—"
                        : (effect.current_weekly_rate > 0 ? "+" : "") +
                          effect.current_weekly_rate.toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/25 p-3">
                    <p className="text-[8px] text-muted-foreground">فرق Trend</p>
                    <p className="mt-1 text-[10px] font-semibold">
                      {signed(effect?.weekly_rate_delta ?? null, " نقطة/أسبوع")}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px]">
                  <div className="rounded-lg bg-success/5 p-2">
                    <strong className="text-success">{done}</strong>
                    <p className="text-muted-foreground">مكتمل</p>
                  </div>
                  <div className="rounded-lg bg-warning/5 p-2">
                    <strong className="text-warning">{activeCommitments.length}</strong>
                    <p className="text-muted-foreground">مفتوح</p>
                  </div>
                  <div className="rounded-lg bg-danger/5 p-2">
                    <strong className="text-danger">{overdue.length}</strong>
                    <p className="text-muted-foreground">متأخر</p>
                  </div>
                </div>

                {live > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: Math.min(100, (done / live) * 100) + "%" }}
                    />
                  </div>
                )}

                {plan.summary && (
                  <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
                    {plan.summary}
                  </p>
                )}

                {!!plan.commitments.length && (
                  <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {plan.commitments
                      .filter((row) => row.status !== "cancelled")
                      .slice(0, 6)
                      .map((row) => {
                        const rowOverdue =
                          (row.status === "open" ||
                            row.status === "in_progress") &&
                          !!row.due_date &&
                          row.due_date < today;
                        return (
                          <div
                            key={row.id}
                            className="flex items-center gap-2 bg-background p-2.5"
                          >
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10px] font-medium">
                                {row.title}
                              </p>
                              <p className="mt-0.5 text-[8px] text-muted-foreground">
                                {row.owner_name ?? "بدون مسؤول"} ·{" "}
                                {formatDate(row.due_date)}
                              </p>
                            </div>
                            <span
                              className={
                                row.status === "done"
                                  ? "rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success"
                                  : rowOverdue
                                    ? "rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger"
                                    : "rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground"
                              }
                            >
                              {rowOverdue
                                ? "متأخر"
                                : COMMITMENT_STATUS[row.status]}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

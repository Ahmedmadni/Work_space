import {
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  Gauge,
  RotateCcw,
  Save,
  Target,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useSavePortfolioObjective } from "@/hooks/use-strategy";
import { buildStrategicScenario } from "@/services/strategy-forecast.service";
import type {
  ObjectiveForecast,
  PortfolioObjective,
  PortfolioStrategyData,
  StrategicScenarioInput,
  StrategyReviewData,
} from "@/types/strategy";

const STATUS_LABELS: Record<ObjectiveForecast["status"], string> = {
  achieved: "متحقق",
  overdue: "متجاوز الموعد",
  projected_on_time: "متوقع في الموعد",
  projected_late: "متوقع متأخرًا",
  stalled: "Trend متوقف/سلبي",
  insufficient_data: "بيانات غير كافية",
};

interface ScenarioDraft {
  objective_id: string;
  due_date: string;
  trend_multiplier: number;
  key_results: Array<{
    key_result_id: string;
    current_value: number;
    target_value: number;
  }>;
}

function draftFromObjective(objective: PortfolioObjective): ScenarioDraft {
  return {
    objective_id: objective.id,
    due_date: objective.due_date ?? "",
    trend_multiplier: 1,
    key_results: objective.key_results.map((kr) => ({
      key_result_id: kr.id,
      current_value: kr.current_value,
      target_value: kr.target_value,
    })),
  };
}

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

function percent(value: number | null) {
  return value == null ? "—" : Math.round(value) + "%";
}

function signed(value: number | null, suffix = "") {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return (rounded > 0 ? "+" : "") + rounded + suffix;
}

function statusTone(status: ObjectiveForecast["status"]) {
  if (status === "achieved" || status === "projected_on_time") {
    return "bg-success/10 text-success";
  }
  if (
    status === "projected_late" ||
    status === "stalled" ||
    status === "overdue"
  ) {
    return "bg-warning/10 text-warning";
  }
  return "bg-muted text-muted-foreground";
}

function isValidTarget(objective: PortfolioObjective, draft: ScenarioDraft) {
  return objective.key_results.every((kr) => {
    const row = draft.key_results.find(
      (item) => item.key_result_id === kr.id,
    );
    if (!row) return true;
    return kr.direction === "increase"
      ? row.target_value >= kr.baseline_value
      : row.target_value <= kr.baseline_value;
  });
}

export function StrategicScenarioLab({
  strategy,
  reviewData,
  isLoading,
}: {
  strategy: PortfolioStrategyData | undefined;
  reviewData: StrategyReviewData | undefined;
  isLoading: boolean;
}) {
  const save = useSavePortfolioObjective();
  const objectives = strategy?.objectives ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const selectedObjective =
    objectives.find((objective) => objective.id === selectedId) ??
    objectives[0] ??
    null;
  const [drafts, setDrafts] = useState<Record<string, ScenarioDraft>>({});

  const draft = selectedObjective
    ? drafts[selectedObjective.id] ?? draftFromObjective(selectedObjective)
    : null;

  const scenario = useMemo(() => {
    if (!selectedObjective || !draft) return null;
    const input: StrategicScenarioInput = {
      objective_id: selectedObjective.id,
      due_date: draft.due_date || null,
      trend_multiplier: draft.trend_multiplier,
      key_results: draft.key_results,
    };
    return buildStrategicScenario(
      selectedObjective,
      reviewData?.reviews ?? [],
      input,
    );
  }, [selectedObjective, draft, reviewData?.reviews]);

  const changed =
    !!selectedObjective &&
    !!draft &&
    (draft.due_date !== (selectedObjective.due_date ?? "") ||
      draft.key_results.some((row) => {
        const original = selectedObjective.key_results.find(
          (kr) => kr.id === row.key_result_id,
        );
        return (
          !!original &&
          (original.current_value !== row.current_value ||
            original.target_value !== row.target_value)
        );
      }));

  const trendOnlyChange = !!draft && draft.trend_multiplier !== 1;
  const targetValid =
    !!selectedObjective && !!draft && isValidTarget(selectedObjective, draft);

  function updateDraft(
    objective: PortfolioObjective,
    updater: (current: ScenarioDraft) => ScenarioDraft,
  ) {
    setDrafts((current) => {
      const base =
        current[objective.id] ?? draftFromObjective(objective);
      return {
        ...current,
        [objective.id]: updater(base),
      };
    });
  }

  function resetSelected() {
    if (!selectedObjective) return;
    setDrafts((current) => {
      const next = { ...current };
      delete next[selectedObjective.id];
      return next;
    });
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FlaskConical className="h-5 w-5 animate-pulse text-brand" />
          جاري تجهيز Strategic Scenario Lab…
        </div>
      </section>
    );
  }

  if (!objectives.length || !selectedObjective || !draft || !scenario) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FlaskConical className="h-5 w-5 text-brand" />
            Strategic Scenario Lab
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            جرّب تغييرات What-if قبل اعتمادها، وقارن أثرها على Forecast دون
            تعديل البيانات الأصلية أثناء التجربة.
          </p>
        </div>

        <label className="text-[10px] text-muted-foreground">
          Objective
          <select
            value={selectedObjective.id}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1 min-w-64 rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            {objectives.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        كل التغييرات أدناه Staged فقط. زر «اعتماد التغييرات» يحفظ Deadline
        وقيم KR Current/Target فقط.{" "}
        <strong className="text-foreground">Trend multiplier</strong> افتراض
        محاكاة ولا يُحفظ، لأنه ليس حقيقة تشغيلية.
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.85fr)]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">مدخلات السيناريو</h3>
            <button
              type="button"
              onClick={resetSelected}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة الأصل
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">
              Deadline المفترض
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) =>
                  updateDraft(selectedObjective, (current) => ({
                    ...current,
                    due_date: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>

            <label className="text-[10px] text-muted-foreground">
              Trend multiplier — محاكاة فقط
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={draft.trend_multiplier}
                  onChange={(event) =>
                    updateDraft(selectedObjective, (current) => ({
                      ...current,
                      trend_multiplier: Number(event.target.value),
                    }))
                  }
                  className="min-w-0 flex-1"
                />
                <span className="w-12 rounded-lg bg-muted px-2 py-1.5 text-center text-xs font-semibold">
                  ×{draft.trend_multiplier.toFixed(1)}
                </span>
              </div>
              <span className="mt-1 block text-[8px]">
                1.0 = Trend التاريخي، 1.5 = تحسن 50%، 0.5 = نصف السرعة.
              </span>
            </label>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-brand" />
              <h4 className="text-xs font-semibold">Key Results</h4>
            </div>

            {!selectedObjective.key_results.length ? (
              <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                هذا Objective لا يحتوي Key Results؛ يمكن تجربة Deadline وTrend
                فقط.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {selectedObjective.key_results.map((kr) => {
                  const row = draft.key_results.find(
                    (item) => item.key_result_id === kr.id,
                  );
                  if (!row) return null;

                  const invalid =
                    kr.direction === "increase"
                      ? row.target_value < kr.baseline_value
                      : row.target_value > kr.baseline_value;

                  return (
                    <div
                      key={kr.id}
                      className="rounded-xl border border-border bg-background p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[10px] font-semibold">
                          {kr.title}
                        </p>
                        <span className="text-[8px] text-muted-foreground">
                          Baseline {kr.baseline_value} {kr.unit ?? ""}
                        </span>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="text-[9px] text-muted-foreground">
                          Current
                          <input
                            type="number"
                            step="any"
                            value={row.current_value}
                            onChange={(event) =>
                              updateDraft(selectedObjective, (current) => ({
                                ...current,
                                key_results: current.key_results.map((item) =>
                                  item.key_result_id === kr.id
                                    ? {
                                        ...item,
                                        current_value: Number(
                                          event.target.value,
                                        ),
                                      }
                                    : item,
                                ),
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                          />
                        </label>
                        <label className="text-[9px] text-muted-foreground">
                          Target
                          <input
                            type="number"
                            step="any"
                            value={row.target_value}
                            onChange={(event) =>
                              updateDraft(selectedObjective, (current) => ({
                                ...current,
                                key_results: current.key_results.map((item) =>
                                  item.key_result_id === kr.id
                                    ? {
                                        ...item,
                                        target_value: Number(
                                          event.target.value,
                                        ),
                                      }
                                    : item,
                                ),
                              }))
                            }
                            className={
                              invalid
                                ? "mt-1 w-full rounded-lg border border-danger bg-danger/5 px-2.5 py-2 text-xs"
                                : "mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                            }
                          />
                        </label>
                      </div>

                      {invalid && (
                        <p className="mt-1 text-[8px] text-danger">
                          Target غير متوافق مع اتجاه{" "}
                          {kr.direction === "increase" ? "الزيادة" : "الخفض"} من
                          الـBaseline.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">Baseline مقابل What-if</h3>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-[9px]">
            <div className="rounded-xl bg-muted/30 p-3">
              <p className="text-muted-foreground">Baseline Forecast</p>
              <span
                className={
                  "mt-1 inline-flex rounded-full px-2 py-1 text-[9px] font-medium " +
                  statusTone(scenario.baseline_forecast.status)
                }
              >
                {STATUS_LABELS[scenario.baseline_forecast.status]}
              </span>
            </div>
            <div className="rounded-xl bg-brand/5 p-3">
              <p className="text-muted-foreground">Scenario Forecast</p>
              <span
                className={
                  "mt-1 inline-flex rounded-full px-2 py-1 text-[9px] font-medium " +
                  statusTone(scenario.scenario_forecast.status)
                }
              >
                {STATUS_LABELS[scenario.scenario_forecast.status]}
              </span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {[
              {
                label: "OKR Progress",
                base: percent(scenario.baseline_progress),
                scenario: percent(scenario.scenario_progress),
                delta: signed(scenario.progress_delta, " نقطة"),
                icon: Gauge,
              },
              {
                label: "Progress عند Deadline",
                base: percent(
                  scenario.baseline_forecast.projected_due_progress,
                ),
                scenario: percent(
                  scenario.scenario_forecast.projected_due_progress,
                ),
                delta: signed(
                  scenario.projected_due_delta,
                  " نقطة",
                ),
                icon: CalendarClock,
              },
              {
                label: "تاريخ الوصول المتوقع",
                base: formatDate(
                  scenario.baseline_forecast.projected_completion_date,
                ),
                scenario: formatDate(
                  scenario.scenario_forecast.projected_completion_date,
                ),
                delta:
                  scenario.completion_date_delta_days == null
                    ? "—"
                    : signed(
                        scenario.completion_date_delta_days,
                        " يوم",
                      ),
                icon: TrendingUp,
              },
            ].map(({ label, base, scenario: value, delta, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[9px] font-semibold">{label}</p>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px]">
                  <div>
                    <p className="text-[8px] text-muted-foreground">Baseline</p>
                    <p className="mt-0.5 font-semibold">{base}</p>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div>
                    <p className="text-[8px] text-muted-foreground">Scenario</p>
                    <p className="mt-0.5 font-semibold text-brand">{value}</p>
                  </div>
                </div>
                <p className="mt-2 text-[8px] text-muted-foreground">
                  الفرق: {delta}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-muted/20 p-3 text-[9px] leading-5 text-muted-foreground">
            Scenario Deadline: {formatDate(draft.due_date || null)} · Trend
            multiplier ×{draft.trend_multiplier.toFixed(1)}
          </div>

          {trendOnlyChange && !changed && (
            <div className="mt-3 rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-info">
              التغيير الحالي محاكاة Trend فقط؛ لا توجد بيانات فعلية لاعتمادها.
            </div>
          )}

          {!targetValid && (
            <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 p-3 text-[9px] leading-5 text-danger">
              صحح Targets غير المتوافقة قبل الاعتماد.
            </div>
          )}

          <button
            type="button"
            disabled={
              !changed ||
              !targetValid ||
              !selectedObjective.can_edit ||
              save.isPending
            }
            onClick={() => {
              const overrides = new Map(
                draft.key_results.map((row) => [
                  row.key_result_id,
                  row,
                ] as const),
              );

              save.mutate(
                {
                  id: selectedObjective.id,
                  expected_version: selectedObjective.version,
                  title: selectedObjective.title,
                  description: selectedObjective.description,
                  status: selectedObjective.status,
                  owner_user_id: selectedObjective.owner_user_id,
                  start_date: selectedObjective.start_date,
                  due_date: draft.due_date || null,
                  key_results: selectedObjective.key_results.map((kr) => {
                    const row = overrides.get(kr.id);
                    return {
                      id: kr.id,
                      title: kr.title,
                      unit: kr.unit,
                      direction: kr.direction,
                      baseline_value: kr.baseline_value,
                      current_value: row?.current_value ?? kr.current_value,
                      target_value: row?.target_value ?? kr.target_value,
                      weight: kr.weight,
                    };
                  }),
                  project_ids: selectedObjective.project_ids,
                  milestones: selectedObjective.milestones.map((row) => ({
                    project_id: row.project_id,
                    board_id: row.board_id,
                    node_id: row.node_id,
                  })),
                },
                {
                  onSuccess: () => {
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[selectedObjective.id];
                      return next;
                    });
                  },
                },
              );
            }}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {changed ? (
              <>
                <Save className="h-4 w-4" />
                اعتماد التغييرات الفعلية
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                لا توجد تغييرات فعلية للحفظ
              </>
            )}
          </button>

          {!selectedObjective.can_edit && (
            <p className="mt-2 text-center text-[9px] text-muted-foreground">
              يمكنك تشغيل السيناريو، لكن اعتماد البيانات يتطلب صلاحية تعديل
              Objective.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
